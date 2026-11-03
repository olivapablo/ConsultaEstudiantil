/**
 * EmailService
 * Generación de enlaces mailto: preformateados para envío de consignas de recuperación.
 * No envía correos automáticamente sin la confirmación interactiva del docente.
 */

class EmailService {
  static prepareMailtoLink({ studentEmail, studentName, jobTitle, driveUrl, teacherName }) {
    if (!studentEmail || !studentEmail.trim()) {
      return {
        ready: false,
        error: 'El alumno no tiene una dirección de correo electrónico registrada. Agregala desde la sección Alumnos.'
      };
    }

    const subject = `Consigna de Recuperación: ${jobTitle} - Educación Física`;
    const body = `Hola ${studentName},

Te comparto la consigna de recuperación para el trabajo práctico "${jobTitle}".

Podés consultar y descargar el material directamente desde el siguiente enlace de Google Drive:
${driveUrl}

Por favor, revisá las fechas límites y las pautas indicadas en el documento. Ante cualquier duda podés consultar en clase.

Saludos cordiales,
${teacherName || 'Profesor/a de Educación Física'}`;

    const mailto = `mailto:${encodeURIComponent(studentEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return {
      ready: true,
      url: mailto,
      subject,
      body
    };
  }

  static openClient(mailtoUrl) {
    if (mailtoUrl) {
      window.location.href = mailtoUrl;
    }
  }
}

if (typeof window !== 'undefined') {
  window.EmailService = EmailService;
}
