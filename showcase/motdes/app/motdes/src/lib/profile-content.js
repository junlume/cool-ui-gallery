import { SERVICE_CASES } from './service-cases.js';

// These are the supplied animation clips' descriptive display names. Grouping
// them by theme does not attribute the original productions to this profile.
const caseNames = (...ids) => ids.map((id) => {
  const item = SERVICE_CASES.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown profile case: ${id}`);
  return item.title;
}).join(' ');

export const PROFILE_INTRO = {
  title: ['FRAME TO', 'MOTION'],
  description: '这里可展示个人头像与简要履历',
  location: '角色 镜头 动漫影像',
};

export const PROFILE_CHAPTERS = [
  {
    number: '01', title: 'Character and Story', lang: 'en',
    label: '角色与故事',
    caseIds: ['metro-encounter', 'cloud-companions'],
    description: [caseNames('metro-encounter', 'cloud-companions'), '表情 反应与互动 让角色更鲜活'],
  },
  {
    number: '02', title: 'Action and Timing', lang: 'en',
    label: '动作与节奏',
    caseIds: ['alley-breakthrough', 'lightsaber-duel'],
    description: [caseNames('alley-breakthrough', 'lightsaber-duel'), '从格挡到反击 以镜头衔接速度与力量'],
  },
  {
    number: '03', title: 'Fantasy Worlds', lang: 'en',
    label: '奇幻世界',
    caseIds: ['gentle-giant', 'forest-awakening'],
    description: [caseNames('gentle-giant', 'forest-awakening'), '林间光影与体型反差 构筑童话般的世界'],
  },
  {
    number: '04', title: 'Frame to Motion', lang: 'en',
    label: '创作方向',
    description: ['角色表演 镜头节奏 场景氛围', '让单帧有情绪 让成片有起伏'],
  },
];

// The four supplied films have their own assets so other galleries keep their selections.
const showcase = (id, title, presentation) => {
  const asset = `/top/profile/selected-20261012/${id}`;
  return {
    id, title,
    video: `${asset}.mp4`,
    poster: `${asset}.jpg`,
    ...presentation,
  };
};

export const PROFILE_SHOWCASES = [
  showcase('girl-and-cat', '少女与猫', {
    titleLines: ['MOMENTS IN', 'MOTION'],
    eyebrow: '01',
    tagline: '表情 陪伴 轻快日常',
    category: 'CHARACTER STUDY',
    reversed: false,
  }),
  showcase('storm-blade', '风暴之刃', {
    titleLines: ['ACTION AND', 'IMPACT'],
    eyebrow: '02',
    tagline: '蓄势 交锋 力量释放',
    category: 'ACTION STUDY',
    reversed: true,
  }),
  showcase('flame-spirit', '焰灵奇想', {
    titleLines: ['CHARACTER', 'AND MAGIC'],
    eyebrow: '03',
    tagline: '焰灵 秘术 奇幻表演',
    category: 'FANTASY WORLDS',
    reversed: false,
  }),
  showcase('scarlet-dance', '赤焰之舞', {
    titleLines: ['RHYTHM OF', 'BATTLE'],
    eyebrow: '04',
    tagline: '赤焰 刀光 动作节奏',
    category: 'ACTION STUDY',
    reversed: true,
  }),
];

export const PROFILE_END = {
  name: 'PHAN HO THUY VY',
  role: 'AI Animation Character Camera Story',
  caption: '让想象继续展开',
};
