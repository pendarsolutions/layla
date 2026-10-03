/* Where the Layla API lives. Empty = same origin (the API serves this page). Override per visit with ?api=URL.
   Port 5500 is the local test page (scripts/run_local_site.bat): it talks to the server through the SSH tunnel on 8790
   and shows the speed readout. */
if (location.port === "5500") {  // legacy: page served separately; the site now comes from the API itself
  window.LAYLA_API = window.LAYLA_API || "http://127.0.0.1:8790";
  window.LAYLA_TIMING = true;
}
window.LAYLA_API = window.LAYLA_API || "";
