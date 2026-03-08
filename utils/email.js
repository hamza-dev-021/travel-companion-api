import dotenv from 'dotenv';

dotenv.config();

export const OTP_TIMER_SECONDS = 120;
export const OTP_TIMER_MINUTES = Math.floor(OTP_TIMER_SECONDS / 60);

const MAILJET_API_KEY = process.env.MAILJET_API_KEY;
const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY;
const MAILJET_URL = 'https://api.mailjet.com/v3.1/send';

const SENDER_EMAIL = process.env.GMAIL_USER || 'team.travelcompanion@gmail.com';
const FROM_EMAIL = process.env.EMAIL_FROM || `Travel Companion <${SENDER_EMAIL}>`;
const FROM_ADMIN = process.env.EMAIL_FROM_ADMIN || `Travel Companion Admin <${SENDER_EMAIL}>`;
const FROM_ALERT = process.env.EMAIL_FROM_ALERT || `Travel Companion Alert <${SENDER_EMAIL}>`;

// Parse "Name <email>" into { Name, Email }
const parseFrom = (from) => {
  const match = from.match(/^(.+?)\s*<(.+)>$/);
  return match ? { Name: match[1].trim(), Email: match[2].trim() } : { Email: from };
};

const SPAM_HELP = `<p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 8px;">Can't find this email? Please check your <strong>Spam</strong> or <strong>Junk</strong> folder and mark it as "Not Spam" to receive future emails in your inbox.</p>`;

/**
 * Helper: send email via Mailjet HTTP API with error logging.
 */
const sendEmail = async ({ from, to, subject, html }, fireAndForget = false) => {
  const recipients = (Array.isArray(to) ? to : [to]).map(email => ({ Email: email }));
  const sender = parseFrom(from);
  // Strip HTML to create plain text version (improves deliverability / spam score)
  const textPart = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const send = () =>
    fetch(MAILJET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64'),
      },
      body: JSON.stringify({
        Messages: [{ From: sender, To: recipients, Subject: subject, HTMLPart: html, TextPart: textPart }],
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) console.error('Mailjet error:', JSON.stringify(data));
        else console.log('Email sent via Mailjet');
        return data;
      })
      .catch((err) => console.error('Email send failed:', err));

  if (fireAndForget) {
    send(); // don't await
    return;
  }
  return send();
};

/**
 * Send a password reset email with a link to the reset page.
 * @param {string} to - Recipient email
 * @param {string} resetToken - Raw token to include in the URL
 */
export const sendPasswordResetEmail = async (to, resetToken) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

  sendEmail({
    from: FROM_EMAIL,
    to,
    subject: 'Password Reset — Travel Companion',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <h2 style="color: #1e293b; margin-bottom: 16px;">Reset Your Password</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          We received a request to reset the password for your Travel Companion account.
          Click the button below to set a new password:
        </p>
        <a href="${resetLink}" style="display: inline-block; margin: 24px 0; padding: 12px 32px; background: #465FFF; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Reset Password
        </a>
        <p style="color: #94a3b8; font-size: 13px;">
          This link will expire in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">Travel Companion — Pakistan's Travel Planning Platform</p>
        ${SPAM_HELP}
      </div>
    `,
  }, true); // fire-and-forget
}; // fire-and-forget

/**
 * Send a 6-digit OTP to the user's email for identity verification.
 */
export const sendOtpEmail = async (to, otp, type = 'password-reset') => {
  let verificationMessage = 'Use the following code to verify your identity:';
  if (type === 'registration') {
    verificationMessage = 'Use the following code to verify your email address and complete your registration:';
  } else if (type === 'password-reset') {
    verificationMessage = 'Use the following code to verify your identity for changing your password:';
  } else if (type === 'profile-update') {
    verificationMessage = 'Use the following code to verify your identity for updating your profile:';
  }

  const otpDigits = String(otp).split('').map(d =>
    `<td style="padding: 0 3px;">
      <div style="width: 40px; height: 48px; line-height: 48px; text-align: center; border-radius: 8px; background: #eef2ff; font-size: 28px; font-weight: 700; color: #465FFF; font-family: 'Segoe UI', Tahoma, monospace;">${d}</div>
    </td>`
  ).join('');

  return sendEmail({
    from: FROM_EMAIL,
    to,
    subject: 'Your OTP Code — Travel Companion',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <h2 style="color: #1e293b; margin-bottom: 16px;">Verification Code</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          ${verificationMessage}
        </p>
        <div style="margin: 24px 0; padding: 16px; background: #fff; border: 2px solid #465FFF; border-radius: 8px; text-align: center;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;"><tr>${otpDigits}</tr></table>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center; margin-top: 0;">
          Click the code to select it, then copy
        </p>
        <p style="color: #94a3b8; font-size: 13px;">
          This code will expire in <strong>${OTP_TIMER_MINUTES} minutes</strong>. Do not share it with anyone.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">Travel Companion — Pakistan's Travel Planning Platform</p>
        ${SPAM_HELP}
      </div>
    `,
  });
};

/**
 * Send an email to a user when their booking status changes (confirmed/rejected).
 * @param {Object} booking - Fully populated booking object (with hotel, room, user)
 * @param {string} status - New status ('confirmed' or 'rejected')
 * @param {string} reason - Optional reason (for rejected bookings)
 */
export const sendBookingStatusEmail = async (booking, status, reason = '') => {
  if (!booking?.user?.email) return;

  // Respect user email preference
  const { default: UserModel } = await import('../models/User.js');
  const recipientId = booking.user._id || booking.user;
  const prefs = await UserModel.findById(recipientId).select('preferences').lean();
  if (prefs?.preferences?.emails === false) return;

  const isConfirmed = status === 'confirmed';
  const color = isConfirmed ? '#10b981' : '#f43f5e';
  const icon = isConfirmed ? '✓' : '✕';
  const subject = `Your Booking is ${isConfirmed ? 'Confirmed' : 'Declined'} — Travel Companion`;

  const guestName = booking.user.firstName ? `${booking.user.firstName} ${booking.user.lastName}`.trim() : 'Traveler';
  const hotelName = booking.hotel?.name || 'Hotel';
  const roomType = booking.room?.roomType || 'Room';
  const hotelAddress = booking.hotel?.address
    ? `${booking.hotel.address.city || ''}, ${booking.hotel.address.province || ''}`.replace(/^, | , /g, '').trim()
    : 'Address Not Available';

  const checkIn = booking.checkInDate ? new Date(booking.checkInDate).toLocaleDateString() : 'N/A';
  const checkOut = booking.checkOutDate ? new Date(booking.checkOutDate).toLocaleDateString() : 'N/A';

  let reasonHtml = '';
  if (!isConfirmed && reason) {
    reasonHtml = `
      <div style="margin-top: 16px; padding: 12px; background: rgba(244, 63, 94, 0.1); border-left: 4px solid #f43f5e; border-radius: 4px; color: #881337; font-size: 14px;">
        <strong>Reason:</strong> ${reason}
      </div>
    `;
  }

  // Fire-and-forget
  sendEmail({
    from: FROM_EMAIL,
    to: booking.user.email,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: ${color}; color: white; font-size: 28px; font-weight: bold;">
            ${icon}
          </div>
        </div>
        
        <h2 style="color: #1e293b; margin-bottom: 16px; text-align: center;">Booking ${isConfirmed ? 'Confirmed' : 'Declined'}</h2>
        
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          Dear ${guestName},<br/><br/>
          Your booking request for <strong>${hotelName}</strong> room type <strong>${roomType}</strong> has been <strong>${status}</strong> by the service provider.
        </p>
        
        <div style="margin: 24px 0; padding: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h3 style="margin-top: 0; margin-bottom: 12px; color: #334155; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Booking Details</h3>
          <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Hotel:</strong> ${hotelName}</p>
          <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Location:</strong> ${hotelAddress}</p>
          <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Check-in:</strong> ${checkIn}</p>
          <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Check-out:</strong> ${checkOut}</p>
          <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Guests:</strong> ${booking.numberOfGuests || 1}</p>
          <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Total Price:</strong> $${booking.totalPrice || 0}</p>
        </div>
        
        ${reasonHtml}
        
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
          If you have any questions, please contact the service provider.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Travel Companion — Pakistan's Travel Planning Platform</p>
        ${SPAM_HELP}
      </div>
    `,
  }, true); // fire-and-forget
};

/**
 * Send an email to a service provider when their verification status changes.
 * @param {string} email - Provider's email address
 * @param {string} providerName - Provider's name
 * @param {string} serviceName - Name of the service (Hotel name / Company name)
 * @param {string} serviceType - 'Hotel' or 'Travel'
 * @param {string} status - New status ('approved' or 'rejected')
 * @param {string} reason - Optional reason (for rejected verifications)
 */
export const sendVerificationStatusEmail = async (email, providerName, serviceName, serviceType, status, reason = '') => {
  if (!email) return;

  const isApproved = status === 'approved';
  const color = isApproved ? '#10b981' : '#f43f5e';
  const icon = isApproved ? '✓' : '✕';
  const subject = `${serviceType} Verification ${isApproved ? 'Approved' : 'Rejected'} — Travel Companion`;

  const name = providerName || 'Service Provider';
  const service = serviceName || `Your ${serviceType} Service`;

  let reasonHtml = '';
  if (!isApproved && reason) {
    reasonHtml = `
      <div style="margin-top: 16px; padding: 12px; background: rgba(244, 63, 94, 0.1); border-left: 4px solid #f43f5e; border-radius: 4px; color: #881337; font-size: 14px;">
        <strong>Reason for Rejection:</strong> ${reason}
      </div>
    `;
  }

  // Fire-and-forget
  sendEmail({
    from: FROM_ADMIN,
    to: email,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: ${color}; color: white; font-size: 28px; font-weight: bold;">
            ${icon}
          </div>
        </div>
        
        <h2 style="color: #1e293b; margin-bottom: 16px; text-align: center;">Verification ${isApproved ? 'Approved' : 'Rejected'}</h2>
        
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          Dear ${name},<br/><br/>
          Your verification request for the ${serviceType.toLowerCase()} <strong>${service}</strong> has been <strong>${status}</strong> by an administrator.
        </p>
        
        ${reasonHtml}
        
        ${isApproved ? `
          <p style="color: #475569; font-size: 15px; margin-top: 24px;">
            Congratulations! Your service is now live on Travel Companion. Travelers can now discover and book your services.
          </p>
        ` : `
          <p style="color: #475569; font-size: 15px; margin-top: 24px;">
            Please review the feedback and submit a new verification request with the required corrections from your dashboard.
          </p>
        `}
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Travel Companion — Pakistan's Travel Planning Platform</p>
        ${SPAM_HELP}
      </div>
    `,
  }, true); // fire-and-forget
};

/**
 * Send an emergency alert email to a trusted contact containing live GPS coordinates.
 * @param {string} to - Contact's email address
 * @param {string} contactName - Contact's name
 * @param {string} travelerName - The name of the user who pressed the panic button
 * @param {Object} location - { latitude, longitude, address }
 */
export const sendEmergencyAlertEmail = async (to, contactName, travelerName, location) => {
  if (!to || !location) return;

  const mapLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
  const addressText = location.address || 'Address unavailable';

  sendEmail({
    from: FROM_ALERT,
    to,
    subject: `🚨 EMERGENCY ALERT: ${travelerName} Needs Help!`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fffcfc; border: 2px solid #ef4444; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: #ef4444; color: white; font-size: 32px; font-weight: bold; animation: pulse 2s infinite;">
            ⚠️
          </div>
        </div>
        
        <h2 style="color: #991b1b; margin-bottom: 16px; text-align: center; text-transform: uppercase; font-weight: 900; letter-spacing: 1px;">High Priority Alert</h2>
        
        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
          Dear <strong>${contactName}</strong>,<br/><br/>
          <strong>${travelerName}</strong> has triggered an emergency panic alert from their Travel Companion app and has listed you as a trusted contact.
        </p>
        
        <div style="margin: 24px 0; padding: 20px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px;">
          <h3 style="margin-top: 0; margin-bottom: 12px; color: #991b1b; font-size: 16px; border-bottom: 1px solid #fca5a5; padding-bottom: 8px;">Last Known Location</h3>
          <p style="margin: 4px 0; color: #7f1d1d; font-size: 15px;"><strong>Address:</strong><br/> ${addressText}</p>
          <p style="margin: 12px 0 4px 0; color: #7f1d1d; font-size: 15px;"><strong>Coordinates:</strong><br/> ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</p>
          <p style="margin: 4px 0; color: #7f1d1d; font-size: 13px;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <a href="${mapLink}" style="display: block; width: 100%; text-align: center; margin: 24px 0; padding: 16px 0; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; text-transform: uppercase;">
          Open in Google Maps
        </a>
        
        <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
          Please attempt to contact them immediately or forward these coordinates to local authorities if you suspect they are in danger.
        </p>
        
        <hr style="border: none; border-top: 1px solid #fca5a5; margin: 32px 0 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Automated Alert via Travel Companion</p>
        ${SPAM_HELP}
      </div>
    `,
  }, true); // fire-and-forget
};
