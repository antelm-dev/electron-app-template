import "./style.css";

const status = document.querySelector<HTMLParagraphElement>("#status");

if (!status) throw new Error("Missing status element");

const info = await window.ipc.app.info();
status.textContent = `${info.name} ${info.version} is running on ${info.platform}.`;

