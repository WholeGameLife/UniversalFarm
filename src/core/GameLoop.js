/** 浏览器主循环：固定步长推进逻辑，与渲染帧率解耦 */
export function startLoop(game, { step = 0.1, onFrame } = {}) {
  let last = performance.now();
  let acc = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    acc += Math.min((now - last) / 1000, 1); // 切后台回来最多补 1 秒
    last = now;
    let ticked = false;
    while (acc >= step) {
      game.update(step);
      acc -= step;
      ticked = true;
    }
    if (ticked) onFrame?.();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => (running = false);
}
