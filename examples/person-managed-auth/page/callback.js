// The redirect receiver. The sandbox sends the person's browser here with the
// code; this hands the code and state to the page that framed it. It stores nothing and sends nothing anywhere else.
const q = new URLSearchParams(location.search);
const message = { type: "pma-callback", code: q.get("code"), state: q.get("state"), iss: q.get("iss"), error: q.get("error") };
if (window.parent !== window) {
  window.parent.postMessage(message, location.origin);
  history.replaceState(null, "", location.pathname);
} else {
  document.getElementById("m").textContent = "This page receives the redirect for the walk. Open the walk and start from step 1.";
}
