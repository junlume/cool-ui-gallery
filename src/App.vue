<script setup>
import { ref } from 'vue'
const tracks=[
 {name:'Vibe Pay',tag:'主赛道',desc:'为可运行的 AI 应用接入收款，让创意成为可经营的产品。',detail:'面向可落地、可验证的产品与服务。',delivery:'网页 · App · 桌面应用 · 灵光闪应用',cap:'AI 应用收款'},
 {name:'Skill Pay',tag:'主赛道',desc:'让 AI 技能拥有清晰的价值与可持续的付费方式。',detail:'面向可复用、可交付的智能技能。',delivery:'Skill · API · 工作流',cap:'技能按次付费'},
 {name:'Machine Pay',tag:'特殊赛道',desc:'让机器与机器之间完成自动化支付。',detail:'面向按量付费的机器服务。',delivery:'设备 · API · 自动化',cap:'机器支付'},
 {name:'Token Pay',tag:'特殊赛道',desc:'把连续订阅转化为长期可经营的产品。',detail:'面向稳定的订阅与会员服务。',delivery:'订阅 · 会员 · SaaS',cap:'连续订阅'},
 {name:'Agent Pay',tag:'特殊赛道',desc:'用户授权，Agent 完成购买。',detail:'面向智能体自主决策与支付。',delivery:'Agent · 工具 · 服务',cap:'智能体支付'}
]
const active=ref(0); const open=ref(null)
const choose=i=>{active.value=i;open.value=i}
</script>
<template>
<header class="nav"><b>支付宝 AI</b><nav><a>产品</a><a>开发者</a><a>社区</a><a>活动</a><a>关于我们</a></nav><button>报名参赛 ↗</button></header>
<main>
 <section class="hero"><div class="grid"></div><p class="eyebrow">年度黑客松</p><h1>PAYATHON <em>2026</em></h1><h2>让你的产品<br><strong>走向真实生意</strong></h2><p class="lead">接入支付，验证商业价值。让产品被看见，也为好想法赢得奖励。</p><div class="count">报名中 · 距报名截止 <b>36</b> 天</div><button class="cta">立即报名 <span>↗</span></button></section>
 <section class="partners"><p>赛事合作伙伴</p><div class="marquee"><span v-for="n in 10" :key="n">ANT GROUP　✦　ALIPAY AI　✦</span></div></section>
 <section class="benefits"><p class="eyebrow">参加这场比赛，你能带走什么？</p><div class="benefit-grid"><article><b>01</b><h3>跑通真实商业化</h3><p>接入支付，完成收款与交付，用真实付费检验产品价值。</p></article><article><b>02</b><h3>让产品被看见</h3><p>通过审核可公开展示、分享产品，在用户体验与交流中获得反馈。</p></article><article><b>03</b><h3>争取赛事奖励</h3><p>五条赛道各有机会，不同作品可独立参赛、分别争取奖励。</p></article></div></section>
 <section class="tracks"><p class="eyebrow">找到你的赛道</p><h2>好产品，值得奖励</h2><div class="pool">¥ <strong>901,901</strong> <small>总奖池</small></div><div class="tabs"><button v-for="(t,i) in tracks" :key="t.name" :class="{active:i===active}" @click="choose(i)">{{t.name}} <small>{{t.tag}}</small></button></div><article class="track-card"><div><span class="tag">{{tracks[active].tag}}</span><h3>{{tracks[active].name}}</h3><p>{{tracks[active].desc}}</p><p class="muted">{{tracks[active].detail}}</p></div><div class="card-actions"><button class="cta">创建作品 ↗</button><a>产品介绍 ↗</a></div><footer><span>交付形态</span><b>{{tracks[active].delivery}}</b><span>接入能力</span><b>{{tracks[active].cap}}</b></footer></article></section>
 <section class="steps"><p class="eyebrow">从报名开始</p><h2>从九月启程，到十二月相见</h2><div class="step-grid"><article v-for="(s,i) in ['报名参赛','提交作品','公开展示','参与评选']" :key="s"><b>0{{i+1}}</b><h3>{{s}}</h3><p>{{['支付宝登录，填写参赛信息。暂无完整产品，也可先报名。','选择赛道并提交作品信息，接入支付，持续优化产品。','作品审核通过后公开展示，可分享给用户体验、交流。','参赛作品完成评选后，入围及获奖名单经官方复核后公布。'][i]}}</p></article></div></section>
 <section class="calendar"><p class="eyebrow">活动日历</p><div class="days"><span v-for="d in 12" :key="d"><b>0{{d}}</b><small>Sep</small></span></div></section>
</main><footer class="footer">PAYATHON 2026 · Pay for AI <span>Build in public</span></footer>
</template>
