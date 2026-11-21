
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { ROLE_LABELS } from "../constants/roles";
import "./GuidedTour.css";

const TOUR_STEPS = {
  SUPER_ADMIN: [
    {
      path: "/dashboard",
      target: "dashboard-header",
      title: "Panel principal",
      description:
        "Desde aquí puedes supervisar el portafolio, consultar indicadores y conocer el estado general de las auditorías."
    },
    {
      path: "/planificacion",
      target: "planning-header",
      title: "Gestión de propuestas",
      description:
        "Consulta las propuestas de auditoría, registra nuevas iniciativas y revisa las decisiones pendientes."
    },
    {
      path: "/planificacion",
      target: "planning-list",
      title: "Seguimiento de propuestas",
      description:
        "Cada propuesta conserva su información, estado y progreso de aprobación."
    },
    {
      path: "/auditorias-activas",
      target: "audits-header",
      title: "Auditorías activas",
      description:
        "Consulta las auditorías aprobadas, las que se encuentran en ejecución y su exposición al riesgo."
    },
    {
      path: "/auditorias-activas",
      target: "audits-matrix",
      title: "Matriz de riesgos",
      description:
        "La matriz permite identificar la exposición de las auditorías según su probabilidad e impacto."
    }
  ],

  GERENTE: [
    {
      path: "/dashboard",
      target: "dashboard-header",
      title: "Tu panel principal",
      description:
        "Aquí puedes consultar el estado del portafolio, las propuestas pendientes y las auditorías en curso."
    },
    {
      path: "/dashboard",
      target: "dashboard-actions",
      title: "Acciones principales",
      description:
        "Utiliza los accesos directos para registrar propuestas nuevas o revisar las que necesitan una decisión."
    },
    {
      path: "/planificacion",
      target: "planning-header",
      title: "Crear propuestas",
      description:
        "Puedes registrar iniciativas de auditoría indicando su objetivo, alcance, responsable y periodo de ejecución."
    },
    {
      path: "/planificacion",
      target: "planning-list",
      title: "Revisar y decidir",
      description:
        "Consulta las propuestas abiertas, revisa su información y registra su aprobación o rechazo."
    },
    {
      path: "/auditorias-activas",
      target: "audits-header",
      title: "Supervisar auditorías",
      description:
        "Una vez aprobadas, las auditorías pueden avanzar a ejecución. Desde aquí puedes supervisar su estado."
    },
    {
      path: "/auditorias-activas",
      target: "audits-matrix",
      title: "Supervisión de riesgos",
      description:
        "Consulta la matriz de riesgos para identificar auditorías que requieren mayor atención."
    }
  ],

  JEFATURA: [
    {
      path: "/dashboard",
      target: "dashboard-header",
      title: "Tu panel principal",
      description:
        "Consulta el panorama del portafolio y las actividades relevantes para tu rol."
    },
    {
      path: "/dashboard",
      target: "dashboard-actions",
      title: "Accesos directos",
      description:
        "Desde aquí puedes acceder a las funciones de planificación y consultar las auditorías activas."
    },
    {
      path: "/planificacion",
      target: "planning-header",
      title: "Registrar propuestas",
      description:
        "Puedes documentar iniciativas de auditoría indicando objetivos, alcance, responsables y fechas."
    },
    {
      path: "/planificacion",
      target: "planning-list",
      title: "Consultar propuestas",
      description:
        "Da seguimiento a las propuestas registradas y consulta su estado de aprobación."
    },
    {
      path: "/auditorias-activas",
      target: "audits-header",
      title: "Consultar auditorías",
      description:
        "Revisa las auditorías aprobadas o en ejecución y consulta la información disponible."
    }
  ],

  AUDITOR: [
    {
      path: "/dashboard",
      target: "dashboard-header",
      title: "Tu panel principal",
      description:
        "Aquí puedes consultar las auditorías visibles para tu rol, los pendientes y las actividades que requieren atención."
    },
    {
      path: "/dashboard",
      target: "dashboard-commitments",
      title: "Tus compromisos",
      description:
        "Consulta las actividades asignadas a tu cuenta, sus fechas de vencimiento y su estado."
    },
    {
      path: "/auditorias-activas",
      target: "audits-header",
      title: "Auditorías y ejecución",
      description:
        "Accede a las auditorías disponibles para tu rol y consulta su estado de ejecución."
    },
    {
      path: "/auditorias-activas",
      target: "audits-matrix",
      title: "Matriz de riesgos",
      description:
        "Consulta la clasificación de riesgos de las auditorías y utiliza la información para orientar tu revisión."
    }
  ],

  DIRECTOR: [
    {
      path: "/dashboard",
      target: "dashboard-header",
      title: "Panel de supervisión",
      description:
        "El panel presenta los indicadores generales del portafolio y el estado de las auditorías visibles para tu rol."
    },
    {
      path: "/dashboard",
      target: "dashboard-overview",
      title: "Indicadores del portafolio",
      description:
        "Consulta los registros visibles, las propuestas abiertas, las auditorías activas y los riesgos identificados."
    },
    {
      path: "/planificacion",
      target: "planning-list",
      title: "Consulta de propuestas",
      description:
        "Puedes consultar las propuestas, sus objetivos, responsables y estados. Las decisiones de aprobación corresponden a los roles autorizados."
    },
    {
      path: "/auditorias-activas",
      target: "audits-header",
      title: "Supervisión de auditorías",
      description:
        "Consulta las auditorías en curso y su información de seguimiento."
    },
    {
      path: "/auditorias-activas",
      target: "audits-matrix",
      title: "Exposición al riesgo",
      description:
        "Utiliza la matriz para identificar las áreas de mayor exposición y supervisar el portafolio."
    }
  ]
};

function GuidedTour() {
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, [location.pathname]);

  const role = user?.role;

  const steps = TOUR_STEPS[role] || [];

  const currentStep = steps[stepIndex];

  const finishTour = useCallback(() => {
    setActive(false);

    document
      .querySelectorAll(".vera-tour-highlight")
      .forEach((element) =>
        element.classList.remove("vera-tour-highlight")
      );
  }, []);

  useEffect(() => {
    if (!active || !currentStep) return;

    if (location.pathname !== currentStep.path) {
      navigate(currentStep.path);
      return;
    }

    let timer;

    timer = window.setTimeout(() => {
      document
        .querySelectorAll(".vera-tour-highlight")
        .forEach((element) =>
          element.classList.remove("vera-tour-highlight")
        );

      const target = document.querySelector(
        `[data-tour="${currentStep.target}"]`
      );

      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        target.classList.add("vera-tour-highlight");
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      document
        .querySelectorAll(".vera-tour-highlight")
        .forEach((element) =>
          element.classList.remove("vera-tour-highlight")
        );
    };
  }, [active, currentStep, location.pathname, navigate]);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") finishTour();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () =>
      document.removeEventListener("keydown", handleKeyDown);
  }, [active, finishTour]);

  const startTour = () => {
    if (!steps.length) return;

    setStepIndex(0);
    setActive(true);
    navigate(steps[0].path);
  };

  const nextStep = () => {
    if (stepIndex === steps.length - 1) {
      finishTour();
      return;
    }

    const next = stepIndex + 1;
    setStepIndex(next);
    navigate(steps[next].path);
  };

  const previousStep = () => {
    if (stepIndex === 0) return;

    const previous = stepIndex - 1;
    setStepIndex(previous);
    navigate(steps[previous].path);
  };

  if (!user || !steps.length) return null;

  return (
    <>
      {!active && (
        <button
          type="button"
          className="guided-tour-launcher"
          onClick={startTour}
        >
          <GraduationCap size={19} aria-hidden="true" />
          <span>Guía de VERA</span>
        </button>
      )}

      {active && currentStep && (
        <section
          className="guided-tour-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby="guided-tour-title"
          aria-describedby="guided-tour-description"
        >
          <div className="guided-tour-header">
            <div>
              <span>RECORRIDO GUIADO · {ROLE_LABELS[role]}</span>
              <small>
                Paso {stepIndex + 1} de {steps.length}
              </small>
            </div>

            <button
              type="button"
              onClick={finishTour}
              aria-label="Cerrar recorrido"
            >
              <X size={19} />
            </button>
          </div>

          <div
            className="guided-tour-progress"
            role="progressbar"
            aria-label="Progreso del recorrido"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={stepIndex + 1}
          >
            <span
              style={{
                width: `${((stepIndex + 1) / steps.length) * 100}%`
              }}
            />
          </div>

          <div className="guided-tour-content">
            <h2 id="guided-tour-title" tabIndex={-1}>
              {currentStep.title}
            </h2>

            <p id="guided-tour-description">
              {currentStep.description}
            </p>
          </div>

          <div className="guided-tour-footer">
            <button
              type="button"
              className="tour-secondary"
              onClick={previousStep}
              disabled={stepIndex === 0}
            >
              <ChevronLeft size={17} />
              Anterior
            </button>

            <button
              type="button"
              className="tour-primary"
              onClick={nextStep}
            >
              {stepIndex === steps.length - 1
                ? "Finalizar"
                : "Siguiente"}
              {stepIndex !== steps.length - 1 && (
                <ChevronRight size={17} />
              )}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

export default GuidedTour;
