/**
 * 画质档位（纯表现层设置，不进游戏存档，单独存在 localStorage）。
 * 切换档位会重建渲染管线与星球场景。
 */
export const TIERS = {
  high: {
    id: 'high', label: '高', level: 2,
    pixelRatio: 2, msaa: 4, bloom: true,
    shadows: true, shadowMap: 2048,
    terrain: { radius: 9, detailRadius: 2, textureSize: 256, budgetMs: 4 },
    floraRadius: 3,
    grass: { count: 120000, extent: 80 },
    floraDensity: 1, particles: 900,
    cloudOctaves: 5, envInterval: 2.5, shipLight: true,
  },
  medium: {
    id: 'medium', label: '中', level: 1,
    pixelRatio: 1.5, msaa: 4, bloom: true,
    shadows: true, shadowMap: 1024,
    terrain: { radius: 8, detailRadius: 2, textureSize: 256, budgetMs: 3 },
    floraRadius: 3,
    grass: { count: 56000, extent: 60 },
    floraDensity: 0.75, particles: 500,
    cloudOctaves: 4, envInterval: 4, shipLight: true,
  },
  low: {
    id: 'low', label: '低', level: 0,
    pixelRatio: 1, msaa: 2, bloom: false,
    shadows: false, shadowMap: 512,
    terrain: { radius: 7, detailRadius: 1, textureSize: 192, budgetMs: 2 },
    floraRadius: 2,
    grass: { count: 16000, extent: 40 },
    floraDensity: 0.5, particles: 0,
    cloudOctaves: 3, envInterval: 8, shipLight: false,
  },
};

export const TIER_ORDER = ['low', 'medium', 'high'];

const KEY = 'universal-farm-gfx';

/** 读取玩家手动选择的档位；返回 null 表示“自动” */
export function loadTierPreference() {
  try {
    const v = localStorage.getItem(KEY);
    return TIERS[v] ? v : null;
  } catch {
    return null;
  }
}

export function saveTierPreference(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

/** 按设备粗略猜一个默认档位，之后再由帧率监测微调 */
export function detectTier(renderer) {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua) || matchMedia('(pointer: coarse)').matches;
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    /* 拿不到就按默认 */
  }
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) return 'low';
  if (mobile) return 'low';
  if (/Intel|UHD|Iris|Mali|Adreno|PowerVR/i.test(gpu)) return 'medium';
  if ((navigator.hardwareConcurrency ?? 8) <= 4) return 'medium';
  return 'high';
}

export function lowerTier(id) {
  const i = TIER_ORDER.indexOf(id);
  return i > 0 ? TIER_ORDER[i - 1] : null;
}
