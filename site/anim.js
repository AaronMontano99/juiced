/* JUICED · motion layer. GSAP + ScrollTrigger + SplitText + ScrambleText, Lenis for smooth scroll.
   Everything here is optional: if the CDN fails or the reader prefers reduced motion, the site works as a still page. */
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !window.gsap || !window.ScrollTrigger) return;
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger, ...[window.SplitText, window.ScrambleTextPlugin].filter(Boolean));
  document.documentElement.classList.add("motion");

  // ---------- smooth scroll ----------
  if (window.Lenis) {
    const lenis = new Lenis({
      autoRaf: false, lerp: 0.11, anchors: { offset: -60 },
      prevent: (node) => !!node.closest?.(".tbl-wrap, pre.code, textarea, select"),
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.JUICED_lenis = lenis;
  }

  // ---------- count-ups ----------
  function count(el, delay = 0) {
    const to = parseFloat(el.dataset.to ?? el.textContent), from = parseFloat(el.dataset.from ?? 0);
    const dec = +(el.dataset.dec ?? 0), o = { v: from };
    el.textContent = from.toFixed(dec);
    return gsap.to(o, { v: to, duration: 1.6, delay, ease: "power3.out", onUpdate: () => (el.textContent = o.v.toFixed(dec)) });
  }

  // ---------- hero entrance ----------
  const ready = document.fonts?.ready ?? Promise.resolve();
  ready.then(() => {
    const h1 = document.querySelector(".hero h1");
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".hero .kicker", { y: 12, opacity: 0, duration: 0.6 });
    if (window.SplitText && h1) {
      const sp = SplitText.create(h1, { type: "chars", mask: "chars" });
      tl.from(sp.chars, { yPercent: 110, duration: 0.9, stagger: 0.05 }, "-=0.3");
    }
    tl.from(".hero .lede", { y: 18, opacity: 0, duration: 0.8, stagger: 0.12 }, "-=0.5")
      .from(".hero .tile", { y: 28, opacity: 0, duration: 0.8, stagger: 0.1 }, "-=0.5")
      .add(() => document.querySelectorAll(".tile [data-to]").forEach((el, i) => count(el, i * 0.12)), "-=0.6");

    // section headlines rise line by line
    if (window.SplitText) {
      document.querySelectorAll(".case h2").forEach((h) => {
        SplitText.create(h, {
          type: "lines", mask: "lines", autoSplit: true,
          onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 0.9, ease: "power3.out", stagger: 0.09,
            scrollTrigger: { trigger: h, start: "top 88%", once: true } }),
        });
      });
    }
    document.querySelectorAll(".case .kicker, .case .prose").forEach((el) =>
      gsap.from(el, { y: 20, opacity: 0, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } }));
    ScrollTrigger.refresh();
  });

  // ---------- charts draw themselves ----------
  const HORIZONTAL = new Set(["canseco"]);
  function prep(fig) {
    if (fig.dataset.revealed) return;
    const svg = fig.querySelector(".chart svg");
    if (!svg || svg.dataset.prepped) return;
    svg.dataset.prepped = 1;
    fig._st?.kill();
    const q = (s) => [...svg.querySelectorAll(s)];
    const lines = q("path.ln");
    lines.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
    const bars = q("path.f1, path.f2, path.f-soft, path.f-deep, rect.f1, rect.f-soft, rect.f-deep");
    const dots = q("circle:not(.hit):not([visibility])");
    const fades = q(".bandrect, path.step, line.marker, .lbl, .lbl-strong");
    const conns = q("line.connector");
    const horiz = HORIZONTAL.has(fig.dataset.chart);
    gsap.set(bars, horiz ? { scaleX: 0, transformOrigin: "0% 50%" } : { scaleY: 0, transformOrigin: "50% 100%" });
    gsap.set(dots, { scale: 0, transformOrigin: "50% 50%" });
    gsap.set(conns, { scaleX: 0, transformOrigin: "0% 50%" });
    gsap.set(fades, { opacity: 0 });
    fig._st = ScrollTrigger.create({
      trigger: fig, start: "top 82%", once: true,
      onEnter: () => {
        const tl = gsap.timeline({ onComplete: () => (fig.dataset.revealed = 1) });
        tl.to(q(".bandrect"), { opacity: 1, duration: 0.5 }, 0)
          .to(lines, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut", stagger: 0.15 }, 0.1)
          .to(bars, { scaleX: 1, scaleY: 1, duration: 0.7, ease: "power3.out", stagger: 0.035 }, 0.1)
          .to(conns, { scaleX: 1, duration: 0.6, ease: "power2.out", stagger: 0.05 }, 0.15)
          .to(dots, { scale: 1, duration: 0.45, ease: "back.out(2.2)", stagger: { each: 0.03, from: "start" } }, 0.35)
          .to(fades.filter((n) => !n.classList.contains("bandrect")), { opacity: 1, duration: 0.5, stagger: 0.02 }, 0.6);
      },
    });
  }
  document.addEventListener("juiced:chart", (e) => prep(e.detail));
  document.querySelectorAll("[data-chart]").forEach(prep);

  // ---------- unmask: flip each card, scramble the name in ----------
  function unmask(cards, reveal) {
    return new Promise((done) => {
      const tl = gsap.timeline({ onComplete: done });
      cards.forEach((card, i) => {
        const t = i * 0.035;
        tl.to(card, { rotateY: 90, duration: 0.16, ease: "power1.in" }, t)
          .add(() => {
            reveal(i);
            const nm = card.querySelector(".nm"), text = nm.textContent;
            if (window.ScrambleTextPlugin) gsap.fromTo(nm, { scrambleText: { text: " " } }, { duration: 0.7, scrambleText: { text, chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", speed: 0.7 } });
          }, t + 0.16)
          .fromTo(card, { rotateY: -90 }, { rotateY: 0, duration: 0.32, ease: "power2.out", immediateRender: false }, t + 0.16);
      });
    });
  }

  window.JUICED_anim = { unmask, count, refresh: () => ScrollTrigger.refresh() };
})();
