import type { Platform, InputSource, PipelineConfig, PipelineStep } from '../../shared/types.js';

export interface ParsedProduct {
  name: string;
  description: string;
  price?: string;
  images?: string[];
  features?: string[];
  category?: string;
}

export interface ParseResult {
  success: boolean;
  product?: ParsedProduct;
  error?: string;
}

export type InputParser = (source: InputSource) => Promise<ParseResult>;
