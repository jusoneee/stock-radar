<script setup lang="ts">
import { COMPLIANCE_VERSION } from '@/lib/compliance'
import BackButton from '@/components/BackButton.vue'
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div class="page-head-lead">
        <BackButton />
        <div>
          <h1>关于</h1>
          <p>炒股战士·老猪是一个纯静态的行情、选股与资讯展示项目，无服务端账号体系。</p>
        </div>
      </div>
    </header>

    <div class="card">
      <header class="card-head">
        <h2>项目说明</h2>
        <span class="tag">纯静态站点</span>
      </header>
      <p class="hint-text">
        页面通过浏览器直接请求第三方公开行情与资讯接口，展示指数、行业冷热榜、个股列表与资讯；
        评分与结论均为本地规则化计算，只用于观察市场，不构成任何投资建议。
      </p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>本地账号与凭证</h2>
      </header>
      <p class="hint-text">
        登录态、个人资料、数据源凭证（Token / API Key / 自定义请求头）只保存在当前浏览器的 localStorage，
        不会上传服务端，也不会写入仓库或构建产物。纯静态部署无法保证密钥安全，请勿填入生产密钥。
      </p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>数据来源与合规</h2>
        <span class="tag">v{{ COMPLIANCE_VERSION }}</span>
      </header>
      <p class="hint-text">
        行情与资讯来自第三方公开接口，可能存在延迟、限流或字段变动；接口不可用时页面会明确提示，不会伪造数据。
      </p>
      <p class="about-links">
        <RouterLink to="/legal/terms">使用条款</RouterLink>
        <RouterLink to="/legal/privacy">隐私说明</RouterLink>
        <RouterLink to="/legal/sources">数据来源</RouterLink>
      </p>
    </div>
  </section>
</template>

<style scoped>
.about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--accent);
}
</style>
