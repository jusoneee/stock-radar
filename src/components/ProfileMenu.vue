<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AVATAR_OPTIONS, useProfileStore } from '@/stores/profile'

type PanelMode = 'menu' | 'auth' | 'view' | 'edit'

const store = useProfileStore()
const router = useRouter()

const open = ref(false)
const mode = ref<PanelMode>('menu')
const error = ref('')

const form = reactive({
  nickname: '',
  email: '',
  avatar: AVATAR_OPTIONS[0]!,
  focus: '',
})

function resetForm(): void {
  form.nickname = store.profile.nickname
  form.email = store.profile.email
  form.avatar = store.avatar
  form.focus = store.profile.focus
  error.value = ''
}

function toggle(): void {
  if (open.value) {
    close()
    return
  }
  open.value = true
  mode.value = 'menu'
}

function close(): void {
  open.value = false
  error.value = ''
}

function openAuth(): void {
  resetForm()
  mode.value = 'auth'
}

function openProfile(): void {
  mode.value = 'view'
}

/** Menu entries that leave the popover: route first, then close. */
function go(path: string): void {
  close()
  void router.push(path)
}

function startEdit(): void {
  resetForm()
  mode.value = 'edit'
}

function cancelEdit(): void {
  mode.value = store.loggedIn ? 'view' : 'auth'
  resetForm()
}

function submit(): void {
  const nickname = form.nickname.trim()
  if (nickname.length < 2 || nickname.length > 16) {
    error.value = '昵称需 2–16 个字符'
    return
  }
  const email = form.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error.value = '邮箱格式不正确，可留空'
    return
  }
  error.value = ''
  store.save({
    nickname,
    email,
    avatar: form.avatar,
    focus: form.focus.trim(),
  })
  mode.value = 'view'
}

function logout(): void {
  store.logout()
  mode.value = 'menu'
  resetForm()
}

function onDocumentPointer(event: Event): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.profile-root') || target?.closest('.profile-panel')) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => {
  store.init()
  document.addEventListener('pointerdown', onDocumentPointer)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="profile-root" @click.stop>
    <button
      class="profile-trigger"
      type="button"
      :aria-expanded="open"
      :aria-label="store.loggedIn ? `${store.profile.nickname} 的本地账号` : '打开登录 / 注册'"
      :title="store.loggedIn ? store.profile.nickname : '本地账号'"
      @click="toggle"
    >
      <span v-if="store.loggedIn" class="trigger-avatar" aria-hidden="true">{{ store.avatar }}</span>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5.4 20c.6-3.6 3.1-5.6 6.6-5.6s6 2 6.6 5.6" />
      </svg>
      <span v-if="store.loggedIn" class="trigger-dot" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      class="profile-panel"
      role="dialog"
      aria-modal="false"
      aria-label="本地账号"
      @click.stop
    >
        <div v-if="mode === 'menu'" class="profile-menu">
          <div v-if="store.loggedIn" class="menu-account">
            <span class="profile-avatar" aria-hidden="true">{{ store.avatar }}</span>
            <div class="profile-info">
              <strong>{{ store.profile.nickname }}</strong>
              <p>{{ store.profile.email || '未填写邮箱' }}</p>
            </div>
          </div>
          <p v-else class="menu-hint">纯静态项目没有服务端账号，登录态仅保存在本机浏览器。</p>

          <button v-if="!store.loggedIn" class="menu-item menu-primary" type="button" @click="openAuth">
            <span>登录</span>
            <span class="menu-arrow" aria-hidden="true">›</span>
          </button>
          <button v-else class="menu-item" type="button" @click="openProfile">
            <span>个人资料</span>
            <span class="menu-arrow" aria-hidden="true">›</span>
          </button>
          <button class="menu-item" type="button" @click="go('/settings')">
            <span>设置</span>
            <span class="menu-arrow" aria-hidden="true">›</span>
          </button>
          <button class="menu-item" type="button" @click="go('/about')">
            <span>关于</span>
            <span class="menu-arrow" aria-hidden="true">›</span>
          </button>
          <button v-if="store.loggedIn" class="menu-item menu-logout" type="button" @click="logout">
            退出登录
          </button>
        </div>

        <div v-if="mode === 'view'" class="profile-body">
          <div class="profile-card">
            <span class="profile-avatar" aria-hidden="true">{{ store.avatar }}</span>
            <div class="profile-info">
              <strong>{{ store.profile.nickname }}</strong>
              <p>{{ store.profile.email || '未填写邮箱' }}</p>
              <p v-if="store.profile.focus">关注方向：{{ store.profile.focus }}</p>
            </div>
          </div>

          <div class="profile-actions">
            <button class="btn btn-mini" type="button" @click="startEdit">编辑资料</button>
            <button class="btn btn-mini profile-logout" type="button" @click="logout">退出登录</button>
          </div>

          <p class="local-note">
            纯静态演示：登录态仅以 localStorage 模拟，没有服务端鉴权；退出登录会清除本机保存的账号资料。
          </p>
        </div>

        <form v-else-if="mode === 'auth' || mode === 'edit'" class="profile-form" @submit.prevent="submit">
          <p class="form-title">{{ mode === 'edit' ? '编辑资料' : '登录 / 注册' }}</p>
          <label class="field">
            <span>昵称 <b>必填</b></span>
            <input
              v-model="form.nickname"
              type="text"
              maxlength="16"
              placeholder="2–16 个字符"
              autocomplete="nickname"
            />
          </label>

          <label class="field">
            <span>邮箱 <small>可选</small></span>
            <input
              v-model="form.email"
              type="email"
              maxlength="80"
              placeholder="you@example.com"
              autocomplete="email"
            />
          </label>

          <div class="field">
            <span>头像 <small>可选</small></span>
            <div class="avatar-picker">
              <button
                v-for="item in AVATAR_OPTIONS"
                :key="item"
                class="avatar-option"
                :class="{ 'is-active': form.avatar === item }"
                type="button"
                :aria-label="`选择头像 ${item}`"
                :aria-pressed="form.avatar === item"
                @click="form.avatar = item"
              >
                {{ item }}
              </button>
            </div>
          </div>

          <label class="field">
            <span>偏好 / 关注方向 <small>可选</small></span>
            <input
              v-model="form.focus"
              type="text"
              maxlength="40"
              placeholder="如：半导体、新能源"
            />
          </label>

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              {{ mode === 'edit' ? '保存资料' : '登录 / 注册' }}
            </button>
            <button v-if="mode === 'edit'" class="btn btn-ghost" type="button" @click="cancelEdit">
              取消
            </button>
          </div>

          <p class="local-note">
            纯静态演示：不请求服务端、不校验密码，任意昵称即可创建本地账号，数据只保存在本机浏览器。
          </p>
        </form>
    </div>
  </div>
</template>

<style scoped>
.profile-root {
  position: relative;
  flex: none;
}

.profile-trigger {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--accent-border);
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.profile-trigger:hover {
  border-color: var(--accent);
  background: var(--surface-3);
}

.profile-trigger svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trigger-avatar {
  font-size: 17px;
  line-height: 1;
}

.trigger-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--surface);
  background: var(--down);
}

.profile-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 56;
  width: min(318px, calc(100vw - 24px));
  max-height: min(76vh, 560px);
  overflow-y: auto;
  padding: 12px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.profile-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

/* Menu-first panel: account entry, then fixed settings/about/logout rows. */
.profile-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-account {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
  padding: 2px 4px 10px;
  border-bottom: 1px solid var(--divider);
}

.menu-hint {
  margin: 0 4px 8px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.6;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-soft);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.menu-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.menu-primary {
  color: var(--accent);
  font-weight: 600;
}

.menu-arrow {
  flex: none;
  color: var(--muted);
  font-size: 14px;
}

.menu-logout {
  margin-top: 6px;
  border-top: 1px solid var(--divider);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  color: var(--up);
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.profile-avatar {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface-2);
  font-size: 24px;
}

.profile-info {
  min-width: 0;
}

.profile-info strong {
  display: block;
  font-size: 14px;
}

.profile-info p {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--muted);
  word-break: break-all;
}

.profile-actions {
  display: flex;
  gap: 8px;
}

.profile-logout {
  color: var(--up);
  border-color: var(--danger-border);
  background: var(--danger-soft);
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--text-soft);
}

.field > span {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.field b {
  color: var(--accent);
  font-size: 9px;
  font-weight: 500;
}

.field small {
  color: var(--muted);
  font-size: 9.5px;
}

.field input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
}

.avatar-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.avatar-option {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  font-size: 17px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.avatar-option:hover {
  background: var(--surface-3);
}

.avatar-option.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.form-error {
  margin: 0;
  color: var(--up);
  font-size: 11px;
}

.form-actions {
  display: flex;
  gap: 8px;
}

.local-note {
  margin: 0;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .profile-trigger {
    width: 30px;
    height: 30px;
  }
}
</style>
