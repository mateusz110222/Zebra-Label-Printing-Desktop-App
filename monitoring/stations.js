const byId = (id) => document.getElementById(id);
const message = (text, error = false) => {
  byId("message").textContent = text;
  byId("message").classList.toggle("error", error);
};
let busy = false;
let authorized = false;
const setBusy = (value) => {
  busy = value;
  byId("add-fields").disabled = value || !authorized;
  document.querySelectorAll(".actions button, #refresh").forEach((button) => {
    button.disabled = value || !authorized;
  });
};
async function api(body) {
  const response = await fetch("/monitoring/admin/stations", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (response.status === 401) {
    hideSecret();
    window.location.replace("/login?redirect=%2Fstations%2F");
    throw new Error("Przekierowanie do logowania LDAP…");
  }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 403) {
      authorized = false;
      hideSecret();
    }
    throw new Error(result.message || "Nie udało się wykonać operacji.");
  }
  return result;
}
function confirmAction(text) {
  const dialog = byId("confirmation");
  byId("confirm-message").textContent = text;
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    ),
  );
}
function hideSecret() {
  byId("token").value = "";
  byId("configuration").value = "";
  byId("secret").hidden = true;
}
function showSecret(configuration) {
  byId("server-url").textContent = configuration.url;
  byId("new-id").textContent = configuration.stationId;
  byId("token").value = configuration.token;
  byId("configuration").value = JSON.stringify(configuration, null, 2);
  byId("secret").hidden = false;
  byId("secret").focus();
  byId("secret").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
async function load() {
  const result = await api();
  authorized = true;
  const rows = byId("stations");
  rows.replaceChildren();
  byId("count").textContent = `(${result.stations.length})`;
  for (const station of result.stations) {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    const name = document.createElement("strong");
    name.textContent = station.name;
    const id = document.createElement("small");
    id.textContent = station.station_id;
    identity.append(name, id);
    const state = document.createElement("td");
    state.textContent = station.enabled
      ? station.synthetic
        ? "Testowe"
        : "Aktywny"
      : "Zablokowany";
    if (!station.enabled) state.className = "blocked";
    const seen = document.createElement("td");
    seen.textContent = station.last_seen
      ? new Date(station.last_seen).toLocaleString("pl-PL")
      : "Brak kontaktu";
    const actions = document.createElement("td");
    const buttons = document.createElement("div");
    buttons.className = "actions";
    for (const action of station.enabled ? ["rotate", "block"] : ["rotate"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent =
        action === "block"
          ? "Zablokuj"
          : station.enabled
            ? "Zmień token"
            : "Nowy token i odblokuj";
      button.setAttribute(
        "aria-label",
        `${button.textContent}: ${station.name}`,
      );
      button.addEventListener("click", async () => {
        if (busy) return;
        const text =
          action === "block"
            ? `Zablokować stanowisko „${station.name}”? Przestanie przesyłać dane. Historia wydruków zostanie zachowana.`
            : `Wygenerować nowy token dla „${station.name}”? Poprzedni token przestanie działać. Nowy token trzeba zapisać w aplikacji. Stanowisko zostanie odblokowane.`;
        if (
          !(await confirmAction(
            text +
              (!byId("secret").hidden
                ? " Obecnie wyświetlany token zostanie ukryty."
                : ""),
          ))
        )
          return;
        await mutate({ action, stationId: station.station_id });
      });
      buttons.append(button);
    }
    actions.append(buttons);
    row.append(identity, state, seen, actions);
    rows.append(row);
  }
  if (!result.stations.length) {
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent =
      "Brak stanowisk. Dodaj pierwsze stanowisko w formularzu powyżej.";
    const row = document.createElement("tr");
    row.append(cell);
    rows.append(row);
  }
}
async function mutate(body) {
  if (busy) return;
  setBusy(true);
  try {
    const result = await api(body);
    hideSecret();
    if (result.configuration) showSecret(result.configuration);
    if (body.action === "create") byId("add-form").reset();
    message(
      body.action === "block"
        ? "Stanowisko zostało zablokowane."
        : "Token został wygenerowany. Skopiuj go teraz — nie będzie można go ponownie wyświetlić.",
    );
    try {
      await load();
    } catch {
      message(
        "Zmiana zapisana. Nie udało się odświeżyć listy. Zachowaj pokazany token i spróbuj odświeżyć ponownie.",
        true,
      );
    }
  } catch (error) {
    message(error.message, true);
  } finally {
    setBusy(false);
  }
}
byId("add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (
    !byId("secret").hidden &&
    !(await confirmAction(
      "Wyświetlany token zostanie ukryty. Czy został już zapisany i chcesz dodać kolejne stanowisko?",
    ))
  )
    return;
  await mutate({
    action: "create",
    name: byId("name").value.trim(),
    stationId: byId("stationId").value.trim(),
  });
});
byId("hide-secret").addEventListener("click", async () => {
  if (
    await confirmAction("Ukryć token? Nie będzie można go ponownie wyświetlić.")
  ) {
    hideSecret();
    byId("name").focus();
  }
});
for (const [buttonId, fieldId] of [
  ["copy-token", "token"],
  ["copy-config", "configuration"],
]) {
  byId(buttonId).addEventListener("click", async () => {
    const field = byId(fieldId);
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(field.value);
      else {
        field.focus();
        field.select();
        if (!document.execCommand("copy"))
          throw new Error("Clipboard unavailable");
      }
      message("Skopiowano do schowka.");
    } catch {
      field.focus();
      field.select();
      message("Tekst został zaznaczony. Naciśnij Ctrl+C, aby go skopiować.");
    }
  });
}
async function refresh() {
  setBusy(true);
  try {
    await load();
    message("Lista stanowisk jest aktualna.");
  } catch (error) {
    message(error.message, true);
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent =
      "Lista jest niedostępna. Sprawdź logowanie i spróbuj ponownie.";
    const row = document.createElement("tr");
    row.append(cell);
    byId("stations").replaceChildren(row);
  } finally {
    setBusy(false);
    byId("refresh").disabled = false;
  }
}
byId("refresh").addEventListener("click", () => {
  if (!busy) void refresh();
});
window.addEventListener("pagehide", hideSecret);
void refresh();
