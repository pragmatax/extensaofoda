// Suaviza valores (ease-out): movimento natural, não robótico.
export function lerp(a, b, t) { return a + (b - a) * t; }

// Um "tween" simples: anima um valor de A->B em N frames.
export function makeTween(from, to, frames) {
  return { value: from, from, to, frames, frame: 0, done: false };
}
export function stepTween(tw) {
  if (tw.done) return tw.to;
  tw.frame++;
  const t = Math.min(1, tw.frame / tw.frames);
  const ease = 1 - Math.pow(1 - t, 3);   // ease-out cubic
  tw.value = lerp(tw.from, tw.to, ease);
  if (t >= 1) tw.done = true;
  return tw.value;
}