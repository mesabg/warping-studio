import { BaseFilter } from './baseFilter.js';

export class BlendFilter extends BaseFilter {
  static crossDissolveSurface(context, source, destination, t, width, height) {
    context.clearRect(0, 0, width, height);
    context.globalAlpha = 1;
    context.drawImage(source, 0, 0, width, height);
    context.globalAlpha = this.clamp(t, 0, 1);
    context.drawImage(destination, 0, 0, width, height);
    context.globalAlpha = 1;
  }

  static sigmoidMix(t, sharpness = 10) {
    return 1 / (1 + Math.exp(-sharpness * (this.clamp(t, 0, 1) - 0.5)));
  }
}
