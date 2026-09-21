const DEBUG_FIELDS = '\
<div class="hud-row"><span>solid</span><b id="h-solid"></b></div>\
<div class="hud-row"><span>tile</span><b id="h-tile"></b><span>facing</span><b id="h-side"></b></div>\
<div class="hud-row hud-needle"><span>needle</span><b id="h-needle"></b><span>wants</span><b id="h-wants"></b></div>\
<div class="hud-row hud-key"><span>holonomy</span><b id="h-holo"></b><span>turns</span><b id="h-turns"></b></div>\
<div class="hud-hint">W step &middot; A/D turn &middot; Z undo &middot; R reset &middot; N/P level &middot; C view &middot; T trail</div>';

/** The debug panel. Authoring tool, not player-facing. */
export function createHud(parent = document.body) {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = DEBUG_FIELDS;
  parent.appendChild(el);

  const $ = (id) => el.querySelector(id);
  const out = {
    solid: $('#h-solid'), tile: $('#h-tile'), side: $('#h-side'),
    needle: $('#h-needle'), wants: $('#h-wants'),
    holo: $('#h-holo'), turns: $('#h-turns'),
  };

  // OFF by default: this panel prints `needle` and `wants` next to each
  // other, so leaving it up lets the player win by watching two numbers
  // match instead of reading the solid.
  let visible = false;
  el.style.display = 'none';
  return {
    toggle() { visible = !visible; el.style.display = visible ? '' : 'none'; },
    update(game) {
      if (!visible) return;
      const w = game.walker;
      const h = w.holonomy();
      const slot = game.level.all().find((t) => t.type === 'slot');
      const dash = '\u2014';

      out.solid.textContent = `${game.level.solid} / ${game.level.surface.size} tiles`;
      out.tile.textContent = String(w.tile);
      out.side.textContent = String(w.side);
      out.needle.textContent = w.needle === null ? dash : String(w.needle);
      out.wants.textContent = slot ? String(slot.needle) : dash;
      out.holo.textContent = `${h > 0 ? '+' : ''}${h}\u00B0`;
      out.holo.dataset.live = h !== 0 ? 'yes' : 'no';
      out.turns.textContent = `${w.turnSum}\u00B0`;
    },
  };
}
