import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { NICKNAME_PATTERN, PASSWORD_PATTERN, USERNAME_PATTERN, validEmail } from '@nlmlio/shared';
import type { AuthResponse, NicknameCheckResponse, PublicUser } from '@nlmlio/shared';
import { api, errorMessage } from '../../api/http';

export function AuthPage({
  onLogin,
  notice = '',
}: {
  onLogin: (session: AuthResponse) => void;
  notice?: string;
}) {
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [proof, setProof] = useState<NicknameCheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(notice);
  const nicknameRef = useRef(nickname);
  nicknameRef.current = nickname;
  const valid =
    USERNAME_PATTERN.test(username) &&
    (register
      ? PASSWORD_PATTERN.test(password) &&
        NICKNAME_PATTERN.test(nickname) &&
        validEmail(email) &&
        proof?.nickname === nickname &&
        proof.available
      : password.length > 0);

  async function checkNickname() {
    const candidate = nickname;
    setChecking(true);
    setError('');
    try {
      const result = await api<NicknameCheckResponse>(
        `/auth/nickname?nickname=${encodeURIComponent(candidate)}`,
      );
      if (nicknameRef.current === candidate) setProof(result);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setChecking(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      if (register) {
        await api<PublicUser>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            nickname,
            email,
            nicknameCheckToken: proof?.checkToken,
          }),
        });
        setRegister(false);
        setPassword('');
        setMessage('가입이 완료되었습니다. 로그인해주세요.');
      } else {
        onLogin(
          await api<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
          }),
        );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <a className="brand auth-brand" href="#">
        할리갈리
      </a>
      <h1>{register ? '회원가입' : '로그인'}</h1>
      <p className="auth-caption">
        {register
          ? '나만의 기록을 만들어보세요.'
          : '다시 만나서 반가워요. 당신의 기록이 기다리고 있어요.'}
      </p>
      <form onSubmit={submit} className="auth-form">
        <label>
          아이디
          <input
            autoComplete="username"
            value={username}
            maxLength={20}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="영소문자·숫자 4~20자"
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            maxLength={64}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="영문·숫자 포함 8~64자"
          />
        </label>
        {register && (
          <>
            <label>
              닉네임
              <div className="nickname-row">
                <input
                  value={nickname}
                  maxLength={10}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setProof(null);
                  }}
                  placeholder="한글·영문·숫자 2~10자"
                />
                <button
                  type="button"
                  className="button outline"
                  disabled={!NICKNAME_PATTERN.test(nickname) || checking}
                  onClick={checkNickname}
                >
                  {checking ? '확인 중' : '중복 확인'}
                </button>
              </div>
            </label>
            {proof && (
              <p className={`field-hint ${proof.available ? 'success' : 'error'}`}>
                {proof.available ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.'}
              </p>
            )}
            <label>
              이메일
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </label>
          </>
        )}
        {message && (
          <p className="feedback success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={!valid || busy}>
          {busy ? '처리 중…' : register ? '가입하기' : '로그인'}
        </button>
      </form>
      <button
        className="text-button auth-switch"
        onClick={() => {
          setRegister((value) => !value);
          setError('');
          setMessage('');
        }}
      >
        {register ? '계정이 있나요? 로그인' : '처음 오셨나요? 회원가입'}
      </button>
    </main>
  );
}
