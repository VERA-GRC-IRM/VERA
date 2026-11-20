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
    <header className="dashboard-header"><div><span className="eyebrow">VERA · IA</span><h1>Asistente de VERA</h1><p>Consulta información autorizada y prepara acciones para revisión.</p></div><div className="assistant-readonly"><ShieldCheck size={17} aria-hidden="true" /> Según tu rol</div></header>
    <div className="assistant-layout"><AssistantPanel key={focus ? `${focus.type}:${focus.id}` : "general"} focus={focus} initialConversationId={conversationId} /></div>
    <details className="assistant-page-about"><summary>Alcance y privacidad</summary><p>Las respuestas incluyen fuentes. Las acciones requieren revisión y confirmación. Las preguntas pueden enviar texto e historial reducido a Azure OpenAI.</p></details>
  </section></main></div>;
}

export default Asistente;
