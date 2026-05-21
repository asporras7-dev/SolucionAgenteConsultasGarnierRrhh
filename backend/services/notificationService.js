import nodemailer from 'nodemailer';

let transporter = null;
let testAccount = null;

async function getTransporter() {
  if (transporter) return transporter;

  try {
    console.log('Creando cuenta de prueba en Ethereal Mail para notificaciones...');
    // Generar cuenta de prueba dinámica en Ethereal Mail
    testAccount = await nodemailer.createTestAccount();
    
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    console.log(`✅ Cuenta de Ethereal Mail creada con éxito.`);
    console.log(`   Usuario SMTP: ${testAccount.user}`);
    return transporter;
  } catch (error) {
    console.error('⚠️ Error al crear el transporte de Ethereal Mail, usando fallback de consola:', error.message);
    
    // Fallback: Imprimir en consola si falla el servicio
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('\n✉️ ====== MOCK EMAIL ENVIADO (FALLBACK CONSOLA) ======');
        console.log(`   De:     ${mailOptions.from}`);
        console.log(`   Para:   ${mailOptions.to}`);
        console.log(`   Asunto: ${mailOptions.subject}`);
        console.log(`   Cuerpo: \n${mailOptions.text}`);
        console.log('=====================================================\n');
        return { messageId: 'mock-console-id-' + Date.now() };
      }
    };
    return transporter;
  }
}

/**
 * Envía una notificación por correo al equipo de RRHH.
 * @param {Object} options - Parámetros del correo.
 * @param {string} options.to - Destinatario.
 * @param {string} options.subject - Asunto.
 * @param {string} options.text - Cuerpo en texto plano.
 * @param {string} [options.html] - Cuerpo opcional en HTML.
 */
export async function sendEmail({ to, subject, text, html }) {
  const activeTransporter = await getTransporter();
  
  const mailOptions = {
    from: '"Agente RRHH Garnier" <no-reply@garnier.com>',
    to: to || process.env.HR_EMAIL_RECIPIENT || 'rrhh@garnier.com',
    subject,
    text,
    html: html || text.split('\n').join('<br>')
  };

  const info = await activeTransporter.sendMail(mailOptions);
  
  let previewUrl = null;
  if (testAccount && info.messageId && !info.messageId.startsWith('mock-console-id')) {
    previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`📬 Notificación enviada. Vista previa del correo en: ${previewUrl}`);
  }

  return {
    sent: true,
    messageId: info.messageId,
    previewUrl,
    recipients_ok: [mailOptions.to],
    timestamp: new Date().toISOString()
  };
}
