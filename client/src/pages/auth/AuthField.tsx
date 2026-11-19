import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export type FieldTone = 'hint' | 'error' | 'success';

// 회원가입·로그인 공통 입력란: 라벨, 입력, 입력란 아래 안내·에러 문구(FUNC-001-03)
// 비밀번호 입력란은 입력한 내용을 보거나 숨기는 버튼을 함께 둔다.
export function AuthField({
  id,
  label,
  message,
  tone = 'hint',
  action,
  type,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  message?: string;
  tone?: FieldTone;
  action?: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const secret = type === 'password';
  const messageId = `${id}-message`;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-row">
        <div className="auth-input-wrap">
          <input
            id={id}
            {...input}
            type={secret && revealed ? 'text' : type}
            className={tone === 'hint' ? undefined : `is-${tone}`}
            aria-invalid={tone === 'error' || undefined}
            aria-describedby={message ? messageId : undefined}
          />
          {secret && (
            <button
              type="button"
              className="auth-reveal"
              aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
              aria-pressed={revealed}
              aria-controls={id}
              onClick={() => setRevealed((value) => !value)}
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                <circle cx="12" cy="12" r="3" />
                {revealed && <path d="M4 4l16 16" />}
              </svg>
            </button>
          )}
        </div>
        {action}
      </div>
      {message && (
        <p id={messageId} className={`auth-field-message ${tone}`}>
          {message}
        </p>
      )}
    </div>
  );
}
