import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom provides the DOM globals (document, window, etc.) that React
// Testing Library needs — this is the client equivalent of the server
// suite's real-vs-mocked module discipline: without a registered DOM,
// render() has nothing to mount into.
//
// Must run before @testing-library/react (and its @testing-library/dom
// dependency) is ever imported: `screen` is computed once, at that
// module's own top level, against `document.body` — a static top-level
// `import { cleanup } from "@testing-library/react"` here would resolve
// before this file's own body runs (ES module imports execute first,
// registration happens later), leaving `document` undefined at the moment
// `screen` is captured. Dynamic imports below run at this point in the
// file instead, after registration.
GlobalRegistrator.register();

// React 19 checks this to decide whether it's safe to batch updates
// synchronously inside act() — unset, RTL's render()/fireEvent calls warn
// ("not wrapped in act(...)") even when nothing is actually wrong.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom doesn't implement the Web Audio API. store/global.tsx (the
// sync engine — see CLAUDE.md) kicks off a fire-and-forget
// initializeAudioExclusively() the moment its module loads (inside
// useGlobalStore's create() initializer, gated only on `typeof window !==
// "undefined"`, which happy-dom satisfies) — so any client test that
// imports something which transitively imports that store (e.g. Join.tsx
// → Logo → RoomHeader.tsx → store/global.tsx) hits `new AudioContext()`
// and throws an unhandled rejection, unrelated to whatever the test is
// actually checking. A minimal stub covering exactly the surface
// _initializeAudio touches (createGain/createBufferSource/connect/
// destination) is enough to let that background call finish harmlessly.
class FakeAudioContext {
  destination = {};
  createGain() {
    return { gain: { value: 1 }, connect: () => {} };
  }
  createBufferSource() {
    return { connect: () => {} };
  }
}
(globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;

const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");

// RTL renders accumulate in the DOM across tests otherwise — same reason
// server tests reset globalManager's rooms in beforeEach/afterEach.
afterEach(() => {
  cleanup();
});
