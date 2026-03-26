import { useState } from 'react';

interface ProductInputProps {
  value: { type: 'url' | 'product_detail'; url?: string; productDetail?: string };
  onChange: (value: ProductInputProps['value']) => void;
}

export function ProductInput({ value, onChange }: ProductInputProps) {
  const [inputType, setInputType] = useState<'url' | 'product_detail'>(value.type || 'url');

  return (
    <div className="product-input">
      <div className="input-type-selector">
        <button
          className={`btn ${inputType === 'url' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setInputType('url'); onChange({ type: 'url', url: '' }); }}
        >
          产品链接
        </button>
        <button
          className={`btn ${inputType === 'product_detail' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setInputType('product_detail'); onChange({ type: 'product_detail', productDetail: '' }); }}
        >
          产品详情
        </button>
      </div>

      {inputType === 'url' ? (
        <input
          type="url"
          className="input"
          placeholder="请输入产品链接，如 https://item.taobao.com/item.htm?id=..."
          value={value.url || ''}
          onChange={(e) => onChange({ type: 'url', url: e.target.value })}
        />
      ) : (
        <textarea
          className="input"
          placeholder="请输入产品详情介绍..."
          rows={4}
          value={value.productDetail || ''}
          onChange={(e) => onChange({ type: 'product_detail', productDetail: e.target.value })}
        />
      )}
    </div>
  );
}
