export class BaseFilter {
  static clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  static lerp(a, b, t) {
    return a + (b - a) * t;
  }

  static smoothstep(edge0, edge1, x) {
    const t = this.clamp((x - edge0) / (edge1 - edge0 || 1));
    return t * t * (3 - 2 * t);
  }
}
