import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { NICKNAME_PATTERN, PASSWORD_PATTERN, USERNAME_PATTERN } from '@nlmlio/shared';
import type { NicknameCheckResponse, PublicUser } from '@nlmlio/shared';
import { api, ApiError, errorMessage } from '../../api/http';
import { AuthField } from './AuthField';
import type { FieldTone } from './AuthField';

type Field = 'username' | 'password' | 'nickname';

// FUNCTION.md 「입력값 제한」과 같은 기준. 서버도 shared의 같은 정규식으로 검사한다.
const RULES: Record<Field, { pattern: RegExp; message: string }> = {
  username: {
    pattern: USERNAME_PATTERN,
    message: '아이디는 영문 소문자·숫자 4~20자로 입력해주세요.',
  },
  password: {
    pattern: PASSWORD_PATTERN,
    message: '비밀번호는 8자 이상, 영문과 숫자를 포함해야 합니다.',
  },
  nickname: {
    pattern: NICKNAME_PATTERN,
    message: '닉네임은 한글·영문·숫자 2~10자로 입력해주세요.',
  },
};

function isField(name: string): name is Field {
  return name in RULES;
}

// FUNC-001-01 회원가입(비밀번호 확인 포함), 001-02 닉네임 중복 확인, 001-03 입력값 유효성 검사
export function SignupPage({
  onLogin,
  onRegistered,
}: {
  onLogin: () => void;
  onRegistered: (username: string) => void;
}) {
  const [values, setValues] = useState<Record<Field, string>>({
    username: '',
    password: '',
    nickname: '',
  });
  // 비밀번호 확인은 화면에서만 비교하고 서버에 보내지 않는다.
  const [confirm, setConfirm] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [proof, setProof] = useState<NicknameCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nicknameRef = useRef(values.nickname);
  nicknameRef.current = values.nickname;

  const formatValid = (field: Field) => RULES[field].pattern.test(values[field]);
  // 중복 확인 뒤 닉네임을 바꾸면 확인 결과는 무효다(001-02).
  const checked = proof?.nickname === values.nickname ? proof : null;
  const confirmed = confirm.length > 0 && confirm === values.password;
  const valid =
    formatValid('username') &&
    formatValid('password') &&
    confirmed &&
    formatValid('nickname') &&
    Boolean(checked?.available);

  function fieldError(field: Field): string | undefined {
    if (serverErrors[field]) return serverErrors[field];
    if (touched[field] && !formatValid(field)) return RULES[field].message;
  }

  function change(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  }

  function touch(field: Field) {
    if (values[field]) setTouched((current) => ({ ...current, [field]: true }));
  }

  async function checkNickname() {
    const candidate = values.nickname;
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

  function showServerError(cause: unknown) {
    if (!(cause instanceof ApiError)) return setError(errorMessage(cause));
    const { code, fields = {} } = cause.detail;
    if (code === 'USERNAME_TAKEN')
      return setServerErrors({ username: '이미 가입된 아이디입니다.' });
    if (code === 'NICKNAME_TAKEN') {
      setProof(null);
      return setServerErrors({ nickname: '이미 사용 중인 닉네임입니다.' });
    }
    if (code === 'VALIDATION_FAILED') {
      const next: Partial<Record<Field, string>> = {};
      for (const [name, reason] of Object.entries(fields)) {
        if (!isField(name)) continue;
        // 닉네임 확인 토큰 오류는 서버가 한국어 안내를 보낸다. 나머지는 규칙 문구로 보여준다.
        next[name] = name === 'nickname' && formatValid('nickname') ? reason : RULES[name].message;
      }
      if (next.nickname) setProof(null);
      if (Object.keys(next).length) return setServerErrors(next);
    }
    setError(errorMessage(cause));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched({ username: true, password: true, nickname: true });
    setConfirmTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await api<PublicUser>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: values.username,
          password: values.password,
          nickname: values.nickname,
          nicknameCheckToken: checked?.checkToken,
        }),
      });
      onRegistered(values.username);
    } catch (cause) {
      showServerError(cause);
    } finally {
      setBusy(false);
    }
  }

  const nicknameError = fieldError('nickname');
  let nicknameMessage: string | undefined = nicknameError;
  let nicknameTone: FieldTone = nicknameError ? 'error' : 'hint';
  if (!nicknameError && checked) {
    nicknameMessage = checked.available
      ? '사용할 수 있는 닉네임입니다.'
      : '이미 사용 중인 닉네임입니다.';
    nicknameTone = checked.available ? 'success' : 'error';
  } else if (!nicknameError && proof) {
    nicknameMessage = '닉네임이 바뀌었어요. 중복 확인을 다시 해주세요.';
  }
  const usernameError = fieldError('username');
  const passwordError = fieldError('password');
  const confirmError =
    confirmTouched && confirm && !confirmed ? '비밀번호가 일치하지 않습니다.' : undefined;
  const confirmMatched = confirmed && formatValid('password');

  return (
    <div className="auth-signup">
      <header className="auth-topbar">
        <span className="brand">낼래말래</span>
        <p>
          이미 계정이 있나요?{' '}
          <button type="button" className="auth-link" onClick={onLogin}>
            로그인
          </button>
        </p>
      </header>
      <main className="auth-signup-main">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1>회원가입</h1>
          <AuthField
            id="signup-username"
            label="ID"
            autoComplete="username"
            maxLength={20}
            value={values.username}
            tone={usernameError ? 'error' : 'hint'}
            message={usernameError ?? '영문 소문자·숫자 4~20자'}
            onChange={(e) => change('username', e.target.value)}
            onBlur={() => touch('username')}
          />
          <AuthField
            id="signup-password"
            label="PASSWORD"
            type="password"
            autoComplete="new-password"
            maxLength={64}
            value={values.password}
            tone={passwordError ? 'error' : 'hint'}
            message={passwordError}
            onChange={(e) => change('password', e.target.value)}
            onBlur={() => touch('password')}
          />
          <AuthField
            id="signup-password-confirm"
            label="CONFIRM PASSWORD"
            type="password"
            autoComplete="new-password"
            maxLength={64}
            value={confirm}
            tone={confirmError ? 'error' : confirmMatched ? 'success' : 'hint'}
            message={confirmError ?? (confirmMatched ? '비밀번호가 일치합니다.' : undefined)}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError('');
            }}
            onBlur={() => setConfirmTouched(confirm.length > 0)}
          />
          <AuthField
            id="signup-nickname"
            label="NICKNAME"
            maxLength={10}
            value={values.nickname}
            tone={nicknameTone}
            message={nicknameMessage}
            onChange={(e) => change('nickname', e.target.value)}
            onBlur={() => touch('nickname')}
            action={
              <button
                type="button"
                className="button outline"
                disabled={!formatValid('nickname') || checking || Boolean(checked)}
                onClick={checkNickname}
              >
                {checking ? '확인 중' : '중복 확인'}
              </button>
            }
          />
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary auth-submit" disabled={!valid || busy}>
            {busy ? '가입 중…' : '가입하기'}
          </button>
          {!valid && (
            <p className="auth-guide">
              모든 항목을 입력하고 비밀번호 확인과 닉네임 중복 확인을 마치면 활성화됩니다.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
