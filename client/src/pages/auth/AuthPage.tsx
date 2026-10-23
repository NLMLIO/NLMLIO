import { useState } from 'react';
import type { AuthResponse } from '@nlmlio/shared';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';

// 로그인되지 않은 사용자의 화면: 로그인 ↔ 회원가입 전환
export function AuthPage({
  onLogin,
  notice = '',
}: {
  onLogin: (session: AuthResponse) => void;
  notice?: string;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState(notice);
  const [username, setUsername] = useState('');

  if (mode === 'signup')
    return (
      <SignupPage
        onLogin={() => {
          setMessage('');
          setMode('login');
        }}
        onRegistered={(registered) => {
          // 가입 완료 시 로그인 화면으로 이동한다(001-01).
          setUsername(registered);
          setMessage('가입이 완료되었습니다. 로그인해주세요.');
          setMode('login');
        }}
      />
    );
  return (
    <LoginPage
      initialUsername={username}
      notice={message}
      onLogin={onLogin}
      onSignup={() => {
        setMessage('');
        setMode('signup');
      }}
    />
  );
}
