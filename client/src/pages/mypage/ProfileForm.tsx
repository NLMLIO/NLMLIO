import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { NICKNAME_PATTERN, PASSWORD_PATTERN, validEmail } from '@nlmlio/shared';
import type {
  NicknameCheckResponse,
  PublicUser,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '@nlmlio/shared';
import { api, ApiError, errorMessage } from '../../api/http';

export function ProfileForm({
  user,
  onSave,
  onPasswordChanged,
}: {
  user: PublicUser;
  onSave: (user: PublicUser) => void;
  onPasswordChanged: () => void;
}) {
  const [nickname, setNickname] = useState(user.nickname);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [checked, setChecked] = useState<NicknameCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const nicknameRef = useRef(nickname);
  nicknameRef.current = nickname;
  const nicknameChanged = nickname !== user.nickname;
  const passwordStarted = Boolean(currentPassword || newPassword);
  const dirty = nicknameChanged || email !== user.email || passwordStarted;
  const nicknameValid = NICKNAME_PATTERN.test(nickname);
  const passwordValid =
    !passwordStarted || Boolean(currentPassword && PASSWORD_PATTERN.test(newPassword));
  const canSave =
    dirty &&
    nicknameValid &&
    validEmail(email) &&
    passwordValid &&
    (!nicknameChanged || (checked?.nickname === nickname && checked.available));

  function cancel() {
    setNickname(user.nickname);
    setEmail(user.email);
    setCurrentPassword('');
    setNewPassword('');
    setChecked(null);
    setMessage('');
    setError('');
  }

  async function checkNickname() {
    const candidate = nickname;
    setChecking(true);
    setError('');
    try {
      const result = await api<NicknameCheckResponse>(
        `/auth/nickname?nickname=${encodeURIComponent(candidate)}`,
      );
      if (nicknameRef.current === candidate) setChecked(result);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setChecking(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    const body: UpdateProfileRequest = {
      ...(nicknameChanged ? { nickname, nicknameCheckToken: checked?.checkToken } : {}),
      ...(email !== user.email ? { email } : {}),
      ...(passwordStarted ? { currentPassword, newPassword } : {}),
    };
    try {
      const result = await api<UpdateProfileResponse>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSave(result.user);
      setCurrentPassword('');
      setNewPassword('');
      setChecked(null);
      if (result.requiresLogin) onPasswordChanged();
      else setMessage('변경사항을 저장했습니다.');
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.detail.code === 'INVALID_CREDENTIALS'
          ? '현재 비밀번호가 맞지 않습니다.'
          : errorMessage(cause),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-panel" aria-labelledby="edit-heading">
      <h2 id="edit-heading">개인정보 수정</h2>
      <form className="profile-form" onSubmit={submit}>
        <div className="profile-fields">
          <label htmlFor="nickname">NICKNAME</label>
          <div className="nickname-row">
            <input
              id="nickname"
              value={nickname}
              maxLength={10}
              className={nicknameChanged && checked?.nickname !== nickname ? 'needs-check' : ''}
              onChange={(e) => {
                setNickname(e.target.value);
                setChecked(null);
                setMessage('');
              }}
              aria-describedby="nickname-hint"
            />
            <button
              className="button outline"
              type="button"
              onClick={checkNickname}
              disabled={!nicknameChanged || !nicknameValid || checking || saving}
            >
              {checking ? '확인 중' : '중복 확인'}
            </button>
          </div>
          <p
            className={`field-hint ${checked?.nickname === nickname ? (checked.available ? 'success' : 'error') : nicknameChanged ? 'warning' : ''}`}
            id="nickname-hint"
          >
            {!nicknameValid
              ? '한글·영문·숫자 2~10자로 입력해주세요.'
              : nicknameChanged
                ? checked?.nickname === nickname
                  ? checked.available
                    ? '사용 가능한 닉네임입니다.'
                    : '이미 사용 중인 닉네임입니다.'
                  : '닉네임이 바뀌었어요. 중복 확인을 다시 해주세요.'
                : '닉네임을 변경하려면 중복 확인이 필요합니다.'}
          </p>
          <label htmlFor="email">EMAIL</label>
          <input
            id="email"
            type="email"
            value={email}
            autoComplete="email"
            maxLength={254}
            onChange={(e) => {
              setEmail(e.target.value);
              setMessage('');
            }}
          />
          {email && !validEmail(email) && (
            <p className="field-hint error">올바른 이메일 형식으로 입력해주세요.</p>
          )}
          <hr />
          <label htmlFor="current-password">CURRENT PASSWORD</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            maxLength={64}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호"
          />
          <label htmlFor="new-password">NEW PASSWORD</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            maxLength={64}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="새 비밀번호 · 영문·숫자 포함 8자 이상"
          />
          {passwordStarted && (
            <p className={`field-hint ${passwordValid ? '' : 'warning'}`}>
              {passwordValid
                ? '비밀번호를 변경하면 다시 로그인해야 합니다.'
                : '현재 비밀번호와 영문·숫자 포함 8~64자의 새 비밀번호를 입력해주세요.'}
            </p>
          )}
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="feedback success" role="status">
              {message}
            </p>
          )}
        </div>
        <div className="form-actions">
          <button
            className="button outline"
            type="button"
            disabled={!dirty || saving}
            onClick={cancel}
          >
            취소
          </button>
          <button className="button primary" disabled={!canSave || saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </section>
  );
}
