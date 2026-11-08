<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  FIELD_LABELS,
  NEWS_FIELD_KEYS,
  QUOTE_FIELD_KEYS,
  defaultFieldMap,
  type ConnectionTestResult,
  type CustomFieldKey,
  type CustomSourceConfig,
  type CustomSourceKind,
} from '@/adapters/custom/types'
import { testCustomSource } from '@/adapters/custom/runtime'
import { PROXY_AVAILABLE } from '@/adapters/availability'
import { useCustomSourcesStore } from '@/stores/custom-sources'

const store = useCustomSourcesStore()
store.init()

const staticMode = !PROXY_AVAILABLE

const form = reactive({
  name: '',
  kind: 'quote' as CustomSourceKind,
  urlTemplate: '',
  method: 'GET' as 'GET' | 'POST',
  bodyTemplate: '',
  timeoutMs: 8_000,
  viaProxy: false,
  fieldMap: mapFor('quote'),
})

const token = ref('')
const headersText = ref('')
const savedHeaderText = reactive<Record<string, string>>({})
const testSymbol = ref('600519')
const testing = ref(false)
const testResult = ref<ConnectionTestResult | null>(null)
const testedFingerprint = ref('')
const itemResults = reactive<Record<string, ConnectionTestResult>>({})

const fieldKeys = computed(() => (form.kind === 'quote' ? QUOTE_FIELD_KEYS : NEWS_FIELD_KEYS))
const fields = computed(() => fieldKeys.value.map((key) => ({ key, label: FIELD_LABELS[key] })))

/** Fill every known key so `v-model` never binds to undefined. */
function mapFor(kind: CustomSourceKind): Record<CustomFieldKey, string> {
  const base = defaultFieldMap(kind)
  const keys = Object.keys(FIELD_LABELS) as CustomFieldKey[]
  return Object.fromEntries(keys.map((key) => [key, base[key] ?? ''])) as Record<CustomFieldKey, string>
}

watch(
  () => form.kind,
  (kind) => {
    form.fieldMap = mapFor(kind)
    testResult.value = null
    testedFingerprint.value = ''
  },
)

/** One `Key: Value` per line; blanks and # comments are ignored. */
function parseHeaderLines(text: string): Record<string, string> | undefined {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf(':')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (!key || !value) continue
    result[key] = value
    if (Object.keys(result).length >= 20) break
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function headerLines(headers?: Record<string, string>): string {
  if (!headers) return ''
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

function onSavedHeaders(item: CustomSourceConfig, event: Event): void {
  const text = (event.target as HTMLTextAreaElement).value
  savedHeaderText[item.id] = text
  store.update(item.id, { headers: parseHeaderLines(text) ?? {} })
}

function draftConfig(): CustomSourceConfig {
  return {
    id: 'custom-draft',
    name: form.name.trim() || '未命名数据源',
    kind: form.kind,
    urlTemplate: form.urlTemplate.trim(),
    method: form.method,
    bodyTemplate: form.bodyTemplate.trim() || undefined,
    timeoutMs: Number(form.timeoutMs),
    fieldMap: { ...form.fieldMap },
    viaProxy: form.viaProxy,
    headers: parseHeaderLines(headersText.value),
    enabled: true,
    weight: 0.6,
    createdAt: '1970-01-01T00:00:00.000Z',
  }
}

function fingerprint(config: CustomSourceConfig): string {
  return JSON.stringify({
    kind: config.kind,
    url: config.urlTemplate,
    method: config.method,
    body: config.bodyTemplate ?? '',
    timeout: config.timeoutMs,
    proxy: config.viaProxy,
    headers: config.headers ?? {},
    map: config.fieldMap,
  })
}

const canSave = computed(
  () => Boolean(testResult.value?.ok) && testedFingerprint.value === fingerprint(draftConfig()) && Boolean(form.name.trim()),
)

async function runDraftTest(): Promise<void> {
  testing.value = true
  testResult.value = null
  try {
    const result = await testCustomSource(draftConfig(), { symbol: testSymbol.value, token: token.value })
    testResult.value = result
    testedFingerprint.value = result.ok ? fingerprint(draftConfig()) : ''
  } finally {
    testing.value = false
  }
}

function saveDraft(): void {
  if (!canSave.value) return
  const created = store.add({
    name: form.name,
    kind: form.kind,
    urlTemplate: form.urlTemplate,
    method: form.method,
    bodyTemplate: form.bodyTemplate,
    timeoutMs: Number(form.timeoutMs),
    fieldMap: { ...form.fieldMap },
    viaProxy: form.viaProxy,
    headers: parseHeaderLines(headersText.value),
  })
  if (!created) return
  if (token.value.trim()) store.setToken(created.id, token.value)
  resetDraft()
}

function resetDraft(): void {
  form.name = ''
  form.urlTemplate = ''
  form.bodyTemplate = ''
  form.method = 'GET'
  form.timeoutMs = 8_000
  form.viaProxy = false
  form.fieldMap = mapFor(form.kind)
  token.value = ''
  headersText.value = ''
  testResult.value = null
  testedFingerprint.value = ''
}

async function testSaved(item: CustomSourceConfig): Promise<void> {
  itemResults[item.id] = await testCustomSource(item, {
    symbol: testSymbol.value,
    token: store.tokens[item.id] ?? '',
  })
}

function remove(item: CustomSourceConfig): void {
  const confirmed = window.confirm(`确定删除自定义数据源「${item.name}」？此操作不可撤销。`)
  if (!confirmed) return
  delete itemResults[item.id]
  store.remove(item.id)
}

function errorTone(result: ConnectionTestResult): string {
  return result.ok ? 'test-ok' : 'test-fail'
}
</script>

<template>
  <div class="card">
    <header class="card-head">
      <h2>自定义数据源 <span class="muted">本地配置 {{ store.sources.length }} 个</span></h2>
      <span class="tag">保存前必须测试连接</span>
    </header>
    <p class="hint-text">
      自定义源配置、Token 与请求头只保存在本机浏览器 localStorage，不会写入仓库文件或构建产物；
      静态站点无法保证密钥安全，请勿填入生产密钥。
      勾选「经本地代理」时请求会发往 <code>/api/custom</code>，由服务端按 <code>CUSTOM_SOURCE_ALLOWLIST</code>
      校验域名与路径前缀，代理不会透传任何自定义 Header（Authorization 仅支持直连）。
    </p>
    <details class="source-guide">
      <summary>如何填写自定义源</summary>
      <ul>
        <li>获取方式：本项目不提供默认接口地址；请向你的数据服务商索取 http(s) 接口、鉴权方式与返回字段路径，或使用自己部署的服务。</li>
        <li>填写格式：URL 中用 <code>{symbol}</code> 占位股票代码；Token 直连时作为 <code>Authorization: Bearer</code> 发送；自定义请求头每行 <code>Key: Value</code>，最多 20 项、值不超过 200 字符。</li>
        <li>生效范围：Token 与请求头只作用于该自定义源；请求头仅在直连时发送，走代理时不会透传。</li>
        <li>失败提示：测试连接会返回 HTTP 状态、耗时与失败原因；未开启 CORS 的接口会在浏览器端明确失败，不会伪造数据。</li>
      </ul>
    </details>
    <p v-if="staticMode" class="inline-warn">
      纯静态部署能力边界：当前构建不含 <code>/api/custom</code> 代理，自定义数据源<strong>只支持浏览器可直接访问（CORS 可达）的
      http(s) 地址</strong>；「经本地代理」选项已禁用。未开启 CORS 的接口会在测试连接时明确失败并给出原因，不会伪造数据。
    </p>

    <div v-if="store.sources.length > 0" class="source-list">
      <article v-for="item in store.sources" :key="item.id" class="source-row">
        <div class="source-main">
          <div class="source-title">
            <strong>{{ item.name }}</strong>
            <span class="tag" :class="item.kind === 'quote' ? 'tag-quote' : 'tag-news'">
              {{ item.kind === 'quote' ? '行情' : '资讯' }}
            </span>
            <span v-if="item.viaProxy && staticMode" class="tag tag-key">代理不可用</span>
            <span class="muted">{{ item.method }} · {{ item.timeoutMs }}ms{{ item.viaProxy ? ' · 代理' : '' }}</span>

          </div>
          <code class="source-url">{{ item.urlTemplate }}</code>
          <div class="source-controls">
            <label class="mini-field">
              <span>权重</span>
              <input
                type="number"
                min="0.05"
                max="1"
                step="0.05"
                :value="item.weight"
                @change="store.setWeight(item.id, Number(($event.target as HTMLInputElement).value))"
              />
            </label>
            <label class="mini-field token-field">
              <span>Token（本机保存）</span>
              <input
                type="password"
                autocomplete="off"
                placeholder="可选，勿填生产密钥"
                :value="store.tokens[item.id] ?? ''"
                @input="store.setToken(item.id, ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="mini-field">
              <span>启用</span>
              <input type="checkbox" :checked="item.enabled" @change="store.toggle(item.id)" />
            </label>
            <button class="btn btn-mini" :disabled="testing" @click="testSaved(item)">测试</button>
            <button class="btn btn-mini" @click="remove(item)">删除</button>
          </div>

          <details class="row-advanced">
            <summary>请求头（每行 Key: Value，仅直连生效）</summary>
            <textarea
              rows="2"
              spellcheck="false"
              placeholder="X-API-Key: xxx"
              :value="savedHeaderText[item.id] ?? headerLines(item.headers)"
              @change="onSavedHeaders(item, $event)"
            />
          </details>

          <p v-if="itemResults[item.id]" class="test-result" :class="errorTone(itemResults[item.id]!)">
            HTTP {{ itemResults[item.id]!.status || '—' }} · {{ itemResults[item.id]!.elapsedMs }}ms ·
            样本 {{ itemResults[item.id]!.sampleCount }} 条 — {{ itemResults[item.id]!.message }}
          </p>
        </div>
      </article>
    </div>
    <p v-else class="hint-text">暂无自定义源，使用下方表单添加。内置的东财/腾讯/新浪渠道不受影响。</p>

    <details class="source-form-wrap">
      <summary class="btn btn-mini">新增自定义源</summary>
      <div class="source-form">
        <div class="form-grid">
          <label class="policy-field">
            <span>名称</span>
            <input v-model.trim="form.name" type="text" maxlength="30" placeholder="例如：自建行情网关" />
          </label>
          <label class="policy-field">
            <span>类型</span>
            <select v-model="form.kind">
              <option value="quote">行情</option>
              <option value="news">资讯</option>
            </select>
          </label>
          <label class="policy-field wide">
            <span>URL 模板（支持 {symbol} 占位）</span>
            <input v-model.trim="form.urlTemplate" type="url" placeholder="https://api.example.com/quote/{symbol}" />
          </label>
          <label class="policy-field">
            <span>请求方式</span>
            <select v-model="form.method">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </label>
          <label class="policy-field">
            <span>超时（ms）</span>
            <input v-model.number="form.timeoutMs" type="number" min="2000" max="60000" step="1000" />
          </label>
          <label class="policy-field">
            <span>测试代码</span>
            <input v-model.trim="testSymbol" type="text" placeholder="600519" />
          </label>
          <label class="policy-field">
            <span>Token（本机保存，可留空）</span>
            <input v-model="token" type="password" autocomplete="off" placeholder="直连时作为 Bearer" />
          </label>
          <label class="policy-field wide">
            <span>自定义请求头（每行 Key: Value，仅直连生效）</span>
            <textarea
              v-model="headersText"
              rows="2"
              spellcheck="false"
              placeholder="X-API-Key: xxx"
            />
          </label>
          <label class="policy-field check-field">
            <span>经本地代理（CORS 受限时）{{ staticMode ? '· 纯静态不可用' : '' }}</span>
            <input v-model="form.viaProxy" type="checkbox" :disabled="staticMode" />
          </label>
          <label v-if="form.method === 'POST'" class="policy-field wide">
            <span>POST JSON 模板</span>
            <input v-model.trim="form.bodyTemplate" type="text" placeholder='{"symbol":"{symbol}"}' />
          </label>
        </div>

        <h3 class="map-title">字段映射 <small class="muted">点路径，例如 data.price / data.klines</small></h3>
        <div class="map-grid">
          <label v-for="field in fields" :key="field.key" class="policy-field">
            <span>{{ field.label }}</span>
            <input v-model.trim="form.fieldMap[field.key]" type="text" :placeholder="field.key" />
          </label>
        </div>

        <div class="form-actions">
          <button class="btn" :disabled="testing" @click="runDraftTest">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <button class="btn btn-primary" :disabled="!canSave" @click="saveDraft">保存配置</button>
          <button class="btn btn-ghost" @click="resetDraft">清空</button>
        </div>

        <p v-if="testResult" class="test-result" :class="errorTone(testResult)">
          HTTP {{ testResult.status || '—' }} · 耗时 {{ testResult.elapsedMs }}ms · 样本 {{ testResult.sampleCount }} 条 ·
          {{ testResult.message }}
          <span v-if="!testResult.ok && testResult.hint" class="test-hint">{{ testResult.hint }}</span>
          <span v-if="testResult.samples.length" class="test-samples">示例：{{ testResult.samples.join(' / ') }}</span>
        </p>
        <p v-if="!canSave && testResult?.ok" class="inline-warn">配置已修改，请重新测试后再保存。</p>
        <p v-else-if="!testResult" class="hint-text">需先通过测试连接才能保存，避免保存不可用或字段缺失的配置。</p>
      </div>
    </details>
  </div>
</template>

<style scoped>
.source-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0;
}

.source-row {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface-2);
}

.source-title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tag-quote {
  background: var(--accent-soft);
  color: var(--accent);
}

.tag-news {
  background: rgba(217, 161, 59, 0.12);
  color: var(--warn);
}

.source-url {
  display: block;
  margin: 6px 0;
  padding: 6px 8px;
  background: var(--bg);
  border-radius: 6px;
  font-size: 12px;
  word-break: break-all;
  color: var(--text-soft);
}

.source-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

.mini-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}

.mini-field input[type='number'] {
  width: 76px;
}

.token-field input {
  width: 150px;
}

.test-result {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
}

.test-result.test-ok {
  color: var(--down);
}

.test-result.test-fail {
  color: var(--up);
}

.test-hint,
.test-samples {
  display: block;
  margin-top: 4px;
  color: var(--muted);
}

.source-guide {
  margin: 10px 0;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 10px 8px;
  font-size: 11.5px;
  color: var(--text-soft);
  background: var(--surface-2);
}

.source-guide summary {
  padding: 6px 0;
  color: var(--accent);
  cursor: pointer;
}

.source-guide ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  line-height: 1.55;
}

.source-guide code {
  padding: 0 3px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10.5px;
}

.row-advanced {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-soft);
}

.row-advanced summary {
  padding: 4px 0;
  color: var(--accent);
  cursor: pointer;
}

.policy-field textarea,
.row-advanced textarea {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.policy-field textarea:focus,
.row-advanced textarea:focus {
  outline: none;
  border-color: var(--accent-border);
}

.source-form-wrap {
  margin-top: 14px;
}

.source-form {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.form-grid,
.map-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.map-title {
  margin: 18px 0 10px;
  font-size: 14px;
}

.check-field {
  justify-content: flex-end;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

@media (max-width: 640px) {
  .form-grid,
  .map-grid {
    grid-template-columns: 1fr;
  }

  .token-field input {
    width: 100%;
  }
}
</style>
