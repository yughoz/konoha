// ponytail: cutout kaki cukup untuk ukuran warga saat ini; tambah rig lutut saat perlu close-up.
export function walkRig(variant) {
  if (!Number.isInteger(variant) || variant < 1 || variant > 4) throw new Error('Varian warga tidak valid');
  const [hip, hands, toes] = [[151, 174, 96], [218, 218, 96], [139, 160, 91], [125, 154, 92]][variant - 1];
  const waist = variant === 2 ? hands : hands + 12;
  const x = value => `${value / 192 * 100}%`;
  const y = value => `${value / 256 * 100}%`;
  const image = (part, polygon) => `<img class="walk-${part}" src="/assets/villager-${variant}.png" alt="" style="clip-path:polygon(${polygon})">`;
  return `<span class="walk-rig${variant === 2 ? ' walk-skirt' : ''}" aria-hidden="true" style="--hip:${y(hip)}">
    ${image('leg walk-leg-left', `0% ${y(hands)},50% ${y(hands)},50% ${y(220)},${x(toes)} ${y(224)},${x(toes)} 100%,0% 100%`)}
    ${image('leg walk-leg-right', `50% ${y(hands)},100% ${y(hands)},100% 100%,${x(toes)} 100%,${x(toes)} ${y(224)},50% ${y(220)}`)}
    ${image('body', `0% 0%,100% 0%,100% ${y(waist)},0% ${y(waist)}`)}
  </span>`;
}
