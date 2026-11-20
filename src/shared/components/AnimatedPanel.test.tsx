import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedPanel } from "./AnimatedPanel";

test("AnimatedPanel preserves visible and hidden transition styles", () => {
  const visible = renderToStaticMarkup(
    <AnimatedPanel
      visible
      rootClassName="panel-root"
      contentClassName="panel-content"
    >
      panel body
    </AnimatedPanel>,
  );
  const hidden = renderToStaticMarkup(
    <AnimatedPanel
      visible={false}
      animation="fade"
      slideOffset={32}
      duration={240}
    >
      panel body
    </AnimatedPanel>,
  );

  assert.match(visible, /class="panel-root"/);
  assert.match(visible, /class="panel-content"/);
  assert.match(visible, /--panel-slide:0px/);
  assert.match(visible, /--panel-opacity:1/);
  assert.match(visible, /translateX\(var\(--panel-slide\)\)/);
  assert.match(hidden, /--panel-slide:32px/);
  assert.match(hidden, /--panel-opacity:0/);
  assert.match(
    hidden,
    /transition:opacity 240ms ease-out, transform 240ms ease-out/,
  );
  assert.match(hidden, /transform:none/);
});
