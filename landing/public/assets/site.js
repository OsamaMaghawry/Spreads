// The phone menu and the Tools list, and nothing else.
//
// Shared by the four static pages and by the blog pages the Worker renders,
// so the header behaves the same everywhere. Everything above 40rem is CSS
// only — the links are simply part of the bar there and this script has
// nothing to do.
//
// The open state lives in a data attribute on the nav rather than in a class
// or the `hidden` attribute, because the same element is an inline row on a
// wide screen and a dropdown panel on a narrow one: `hidden` would hide it in
// both.
(function () {
  var nav = document.querySelector(".nav");
  if (!nav) return;

  // The Tools list is a <details>, which opens and closes by itself; it only
  // needs closing when the visitor taps elsewhere or presses Escape.
  var tools = nav.querySelector(".tools");
  if (tools) {
    document.addEventListener("click", function (e) {
      if (tools.open && !tools.contains(e.target)) tools.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && tools.open) {
        tools.open = false;
        tools.querySelector("summary").focus();
      }
    });
  }

  var burger = nav.querySelector(".burger");
  var panel = nav.querySelector(".navlinks");
  if (!burger || !panel) return;

  function set(open) {
    if (open) nav.setAttribute("data-open", "");
    else nav.removeAttribute("data-open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  burger.addEventListener("click", function () {
    set(!nav.hasAttribute("data-open"));
  });

  // A tap anywhere else closes it. The burger is inside .nav, so its own
  // click never reaches this branch.
  document.addEventListener("click", function (e) {
    if (!nav.contains(e.target)) set(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.hasAttribute("data-open")) {
      set(false);
      burger.focus();
    }
  });
})();
