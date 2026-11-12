import { useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import Sidebar from "../components/Sidebar";
import AssistantPanel from "../components/AssistantPanel";
import "./Asistente.css";

function Asistente() {
  const [params] = useSearchParams();
  const type = params.get("type");
  const id = params.get("id");
  const conversationId = params.get("conversation");
  const focus = type && id ? { type, id, title: id } : null;
  return <div className="dashboard-layout"><Sidebar active="asistente" /><main className="dashboard-main"><section className="dashboard-content assistant-page">
    <header className="dashboard-header"><div><span className="eyebrow">VERA · ESPACIO DE IA</span><h1>Asistente de auditoría</h1><p>Consulta expedientes y realiza operaciones permitidas desde la conversación, con vista previa y confirmación.</p></div><div className="assistant-readonly"><ShieldCheck size={17} aria-hidden="true" /> Según tu rol</div></header>
    <div className="assistant-layout"><AssistantPanel key={focus ? `${focus.type}:${focus.id}` : "general"} focus={focus} initialConversationId={conversationId} /></div>
    <details className="assistant-page-about"><summary>Alcance y privacidad del asistente</summary><p>Resume expedientes visibles, muestra fuentes citadas y permite cambios autorizados en conversaciones guardadas, siempre tras una vista previa y una confirmación expresa. Las operaciones se validan en el servidor; el modelo no ejecuta cambios por sí mismo. Algunas preguntas pueden enviar el texto, historial reciente y contexto reducido al despliegue de Azure OpenAI de VERA. Comprueba las fuentes y el resultado antes de actuar.</p></details>
  </section></main></div>;
}

export default Asistente;
