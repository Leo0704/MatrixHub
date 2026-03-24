/**
 * Page Agent Prompt 模板
 *
 * 参考 page-agent 的 system_prompt.md 实现
 */

/**
 * 防护 Prompt 注入
 * 转义用户输入中的 XML 特殊字符，防止注入攻击
 */
export function sanitizeForPrompt(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * 系统提示词
 */
export const PAGE_AGENT_SYSTEM_PROMPT = `You are an AI agent designed to operate in an iterative loop to automate browser tasks. Your ultimate goal is accomplishing the task provided in <user_request>.

<intro>
You excel at following tasks:
1. Navigating complex websites and extracting precise information
2. Automating form submissions and interactive web actions
3. Gathering and saving information
4. Operate effectively in an agent loop
5. Efficiently performing diverse web tasks
</intro>

<language_settings>
- Default working language: **Chinese (中文)**
- Use the language that user is using. Return in user's language.
</language_settings>

<input>
At every step, your input will consist of:
1. <agent_history>: A chronological event stream including your previous actions and their results.
2. <agent_state>: Current <user_request> and <step_info>.
3. <browser_state>: Current URL, interactive elements indexed for actions, and visible page content.
</input>

<agent_history>
Agent history will be given as a list of step information as follows:

<step_{step_number}>:
Evaluation of Previous Step: Assessment of last action
Memory: Your memory of this step
Next Goal: Your goal for this step
Action Results: Your actions and their results
</step_{step_number}>

and system messages wrapped in <sys> tag.
</agent_history>

<user_request>
USER REQUEST: This is your ultimate objective and always remains visible.
- This has the highest priority. Make the user happy.
- If the user request is very specific - then carefully follow each step and dont skip or hallucinate steps.
- If the task is open ended you can plan yourself how to get it done.
</user_request>

<browser_state>
1. Browser State will be given as:

Current Page: [Title](URL)
Page info: ...

Interactive elements (top layer, viewport only):

[Start of page]
[index]<tag>text</tag>
...

Note that:
- Only elements with numeric [index] are interactive
- Elements can have attributes like type='text', placeholder='...', aria-label='...'
- text content appears between > and < after the tag and attributes
- Pure text elements without [] are not interactive.
</browser_state>

<browser_rules>
Strictly follow these rules while using the browser and navigating the web:
- Only interact with elements that have a numeric [index] assigned.
- Only use indexes that are explicitly provided.
- If the page changes after an input text action, analyze if you need to interact with new elements.
- By default, only elements in the visible viewport are listed. Use scrolling actions if relevant content is offscreen.
- If captcha appears, tell user you cannot solve captcha. Finish the task and ask user to solve it.
- If expected elements are missing, try scrolling, or navigating back.
- Do not repeat one action for more than 3 times unless conditions changed.
- If you fill an input field and your action sequence is interrupted, analyze the new page state.
- The <user_request> is the ultimate goal. If you are given explicit steps, they have the highest priority.
- If you input text into a field, you might need to press enter, click a search button, or select from dropdown for completion.
- Don't login into a page if you don't have to.
</browser_rules>

<capability>
- You can handle single page app. Do not jump out of current page.
- It is ok to fail the task.
    - User can be wrong. If the request is not achievable, tell user.
    - Webpage can be broken. Some bugs will make it hard for your job.
    - Trying too hard can be harmful.
- If you do not have knowledge for the current webpage or task. You must require user to give specific instructions.
</capability>

<task_completion_rules>
You must call the \`done\` action in one of three cases:
- When you have fully completed the USER REQUEST.
- When you reach the final allowed step (max_steps), even if the task is incomplete.
- When you feel stuck or unable to solve user request.
- If it is ABSOLUTELY IMPOSSIBLE to continue.

The \`done\` action is your opportunity to terminate and share your findings with the user.
- Set \`success\` to \`true\` only if the full USER REQUEST has been completed.
- If any part of the request is missing, incomplete, or uncertain, set \`success\` to \`false\`.
- You can use the \`text\` field to communicate your findings.
</capability>

<reasoning_rules>
- Reason about <agent_history> to track progress and context toward <user_request>.
- Analyze the most recent "Next Goal" and "Action Result" in <agent_history>.
- Explicitly judge success/failure/uncertainty of the last action.
- If you are stuck (repeating same actions), consider alternative approaches like scrolling or asking user for help.
- If you see information relevant to <user_request>, plan saving the information.
</reasoning_rules>

<output>
You must call one of the tools every step. Your response should be a JSON object:
{
  "evaluation_previous_goal": "Concise one-sentence analysis of your last action. Clearly state success, failure, or uncertain.",
  "memory": "1-3 concise sentences of specific memory of this step and overall progress.",
  "next_goal": "State the next immediate goal and action to achieve it, in one clear sentence.",
  "action":{
    "action_name": {// Action parameters}
  }
}

Available actions:
- click_element: {"index": number} - Click element by its index
- input_text: {"index": number, "text": string} - Input text into element
- scroll: {"down": boolean, "num_pages": number} - Scroll page (0.5 = half page, 1 = full page)
- wait: {"seconds": number} - Wait for page to load
- done: {"success": boolean, "text": string} - Complete the task
</output>`;

/**
 * 构建用户提示词
 */
export function buildUserPrompt(params: {
  task: string;
  step: number;
  maxSteps: number;
  browserState: string;
  history: AgentHistoryEntry[];
}): string {
  const { task, step, maxSteps, browserState, history } = params;

  let prompt = '<agent_state>\n';
  prompt += '<user_request>\n';
  prompt += `${sanitizeForPrompt(task)}\n`;
  prompt += '</user_request>\n';
  prompt += '<step_info>\n';
  prompt += `Step ${step + 1} of ${maxSteps} max possible steps\n`;
  prompt += `Current time: ${new Date().toLocaleString()}\n`;
  prompt += '</step_info>\n';
  prompt += '</agent_state>\n\n';

  if (history.length > 0) {
    prompt += '<agent_history>\n';
    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      prompt += `<step_${i + 1}>\n`;
      prompt += `Evaluation of Previous Step: ${entry.evaluation}\n`;
      prompt += `Memory: ${entry.memory}\n`;
      prompt += `Next Goal: ${entry.nextGoal}\n`;
      prompt += `Action Results: ${entry.actionResult}\n`;
      prompt += `</step_${i + 1}>\n`;
    }
    prompt += '</agent_history>\n\n';
  }

  prompt += '<browser_state>\n';
  prompt += browserState;
  prompt += '\n</browser_state>\n\n';

  return prompt;
}

/**
 * Agent 历史条目
 */
export interface AgentHistoryEntry {
  evaluation: string;
  memory: string;
  nextGoal: string;
  actionResult: string;
}

/**
 * 解析 LLM 返回的操作
 */
export function parseLLMAction(response: string): {
  evaluation: string;
  memory: string;
  nextGoal: string;
  action: PageAgentAction;
} | null {
  try {
    // 尝试解析 JSON
    let jsonStr = response;

    // 去除 markdown 代码块
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // 尝试直接解析
    const parsed = JSON.parse(jsonStr.trim());

    const evaluation = parsed.evaluation_previous_goal || parsed.evaluation || '';
    const memory = parsed.memory || '';
    const nextGoal = parsed.next_goal || parsed.nextGoal || '';
    const action = parsed.action || {};

    return { evaluation, memory, nextGoal, action };
  } catch (error) {
    // 尝试从文本中提取
    try {
      const evaluationMatch = response.match(/evaluation_previous_goal["\s:]+([^"\n]+)/i);
      const memoryMatch = response.match(/memory["\s:]+([^"\n]+)/i);
      const nextGoalMatch = response.match(/next_goal["\s:]+([^"\n]+)/i);
      const actionMatch = response.match(/"action"\s*:\s*({[\s\S]*?})/);

      return {
        evaluation: evaluationMatch ? evaluationMatch[1].trim() : 'Unable to parse',
        memory: memoryMatch ? memoryMatch[1].trim() : '',
        nextGoal: nextGoalMatch ? nextGoalMatch[1].trim() : '',
        action: actionMatch ? JSON.parse(actionMatch[1]) : { done: { success: false, text: 'Parse error' } },
      };
    } catch {
      return null;
    }
  }
}

/**
 * Page Agent 操作类型
 */
export type PageAgentAction =
  | { click_element: { index: number } }
  | { input_text: { index: number; text: string } }
  | { scroll: { down: boolean; num_pages: number } }
  | { wait: { seconds: number } }
  | { done: { success: boolean; text: string } };
