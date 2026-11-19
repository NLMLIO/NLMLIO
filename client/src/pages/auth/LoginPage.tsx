import { useState } from 'react';
import type { FormEvent } from 'react';
import { USERNAME_PATTERN } from '@nlmlio/shared';
import type { AuthResponse } from '@nlmlio/shared';
import { api, ApiError, errorMessage } from '../../api/http';
import { AuthField } from './AuthField';
import { FruitCards } from './FruitCards';

const CREDENTIALS_ERROR = '아이디 또는 비밀번호가 올바르지 않습니다.';

// FUNC-001-04 아이디+비밀번호 로그인
export function LoginPage({
  initialUsername,
  notice,
  onLogin,
  onSignup,
}: {
  initialUsername: string;
  notice: string;
  onLogin: (session: AuthResponse) => void;
  onSignup: () => void;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState('');
  const [showNotice, setShowNotice] = useState(true);
  const filled = username.length > 0 && password.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!filled || busy) return;
    setError('');
    setShowNotice(false);
    // 형식이 틀린 아이디도 어느 쪽이 틀렸는지 알리지 않는다(6.7).
    if (!USERNAME_PATTERN.test(username)) {
      setRejected(true);
      return;
    }
    setBusy(true);
    try {
      onLogin(
        await api<AuthResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }),
      );
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.detail.code : undefined;
      if (code === 'INVALID_CREDENTIALS' || code === 'VALIDATION_FAILED') setRejected(true);
      else setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-split">
      <section className="auth-hero">
        <span className="brand">낼래말래.io</span>
        <FruitCards />
        <div>
          <p className="auth-slogan">
            같은 과일이 5개면.
            <br />
            <span className="lime">먼저 종을 쳐라.</span>
          </p>
          <p className="auth-slogan-caption">친구와 실시간으로 겨루는 온라인 할리갈리</p>
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1>로그인</h1>
          <p className="auth-caption">로그인 상태는 다음 접속에도 유지됩니다.</p>
          {notice && showNotice && (
            <p className="feedback success" role="status">
              {notice}
            </p>
          )}
          <AuthField
            id="login-username"
            label="ID"
            autoComplete="username"
            maxLength={20}
            value={username}
            tone={rejected ? 'error' : 'hint'}
            onChange={(e) => {
              setUsername(e.target.value);
              setRejected(false);
            }}
          />
          <AuthField
            id="login-password"
            label="PASSWORD"
            type="password"
            autoComplete="current-password"
            maxLength={64}
            value={password}
            tone={rejected ? 'error' : 'hint'}
            message={rejected ? CREDENTIALS_ERROR : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              setRejected(false);
            }}
          />
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary auth-submit" disabled={!filled || busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
          <p className="auth-switch">
            아직 계정이 없나요?{' '}
            <button type="button" className="auth-link" onClick={onSignup}>
              회원가입
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}
