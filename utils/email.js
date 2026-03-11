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

/**
 * OPTION 1: Supabase Edge Function (ACTIVE)
 */
const sendEmail = async ({ from, to, subject, html }, fireAndForget = false) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const FUNCTION_URL = process.env.SUPABASE_EMAIL_FUNCTION_URL || `${SUPABASE_URL}/functions/v1/send-email`;

  const sender = parseFrom(from);
  const fromName = sender.Name || 'Travel Companion';

  const send = async () => {
    try {
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          to: Array.isArray(to) ? to : [to],
          subject: subject,
          html: html,
          fromName: fromName,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Supabase Edge Function error:', JSON.stringify(data));
      }
      return data;
    } catch (err) {
      console.error('Email send failed via Edge Function:', err);
    }
  };

  if (fireAndForget) {
    send();
    return;
  }
  return send();
};


/**
 * Send a password reset email
 */
export const sendPasswordResetEmail = async (to, resetToken) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

  sendEmail({
    from: FROM_EMAIL,
    to,
    subject: 'Password Reset — Travel Companion',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 95%; max-width: 480px; margin: 0 auto; padding: 24px 16px; background: #f8fafc; border-radius: 12px; box-sizing: border-box;">
        <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 16px; font-size: 20px;">Reset Your Password</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          We received a request to reset the password for your Travel Companion account.
          Click the button below to set a new password:
        </p>
        <div style="text-align: center;">
          <a href="${resetLink}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #465FFF; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Reset Password
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 0;">
          This link will expire in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">Travel Companion — Pakistan's Travel Planning Platform</p>
      </div>
    `,
  }, true);
};

/**
 * Send a 6-digit OTP
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
    `<td style="padding: 0 4px;">
      <div style="width: 36px; height: 48px; line-height: 48px; text-align: center; border-radius: 8px; background: #eef2ff; font-size: 24px; font-weight: 700; color: #465FFF; font-family: 'Segoe UI', Tahoma, monospace;">${d}</div>
    </td>`
  ).join('');

  return sendEmail({
    from: FROM_EMAIL,
    to,
    subject: 'Your OTP Code — Travel Companion',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 95%; max-width: 480px; margin: 0 auto; padding: 24px 16px; background: #f8fafc; border-radius: 12px; box-sizing: border-box;">
        <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 16px; font-size: 20px;">Verification Code</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          ${verificationMessage}
        </p>
        <div style="margin: 24px 0; padding: 16px 8px; background: #fff; border: 2px solid #465FFF; border-radius: 12px; text-align: center;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;"><tr>${otpDigits}</tr></table>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center;">
          Enter this code in the app to proceed.
        </p>
        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 0;">
          This code will expire in <strong>${OTP_TIMER_MINUTES} minutes</strong>. Do not share it with anyone.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">Travel Companion — Pakistan's Travel Planning Platform</p>
      </div>
    `,
  });
};

/**
 * Send booking status email
 */
export const sendBookingStatusEmail = async (booking, status, reason = '') => {
  if (!booking?.user?.email) return;

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
      <div style="margin-top: 16px; padding: 12px; background: rgba(244, 63, 94, 0.08); border-left: 4px solid #f43f5e; border-radius: 4px; color: #881337; font-size: 14px;">
        <strong>Reason:</strong> ${reason}
      </div>
    `;
  }

  sendEmail({
    from: FROM_EMAIL,
    to: booking.user.email,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 95%; max-width: 480px; margin: 0 auto; padding: 24px 16px; background: #f8fafc; border-radius: 12px; box-sizing: border-box;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 50px; height: 50px; border-radius: 50%; background: ${color}; color: white; font-size: 24px; font-weight: bold; line-height: 50px;">
            ${icon}
          </div>
        </div>
        
        <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 16px; text-align: center; font-size: 20px;">Booking ${isConfirmed ? 'Confirmed' : 'Declined'}</h2>
        
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Dear ${guestName},<br/>
          Your booking for <strong>${hotelName}</strong> (${roomType}) has been <strong>${status}</strong>.
        </p>
        
        <div style="margin: 20px 0; padding: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h3 style="margin-top: 0; margin-bottom: 12px; color: #334155; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Details</h3>
          <p style="margin: 6px 0; color: #475569; font-size: 13px;"><strong>Hotel:</strong> ${hotelName}</p>
          <p style="margin: 6px 0; color: #475569; font-size: 13px;"><strong>Check-in:</strong> ${checkIn}</p>
          <p style="margin: 6px 0; color: #475569; font-size: 13px;"><strong>Check-out:</strong> ${checkOut}</p>
          <p style="margin: 6px 0; color: #475569; font-size: 13px;"><strong>Total:</strong> $${booking.totalPrice || 0}</p>
        </div>
        
        ${reasonHtml}
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">Travel Companion — Pakistan's Travel Planning Platform</p>
      </div>
    `,
  }, true);
};

/**
 * Send verification status email
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
      <div style="margin-top: 16px; padding: 12px; background: rgba(244, 63, 94, 0.08); border-left: 4px solid #f43f5e; border-radius: 4px; color: #881337; font-size: 14px;">
        <strong>Reason:</strong> ${reason}
      </div>
    `;
  }

  sendEmail({
    from: FROM_ADMIN,
    to: email,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 95%; max-width: 480px; margin: 0 auto; padding: 24px 16px; background: #f8fafc; border-radius: 12px; box-sizing: border-box;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 50px; height: 50px; border-radius: 50%; background: ${color}; color: white; font-size: 24px; font-weight: bold; line-height: 50px;">
            ${icon}
          </div>
        </div>
        
        <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 16px; text-align: center; font-size: 20px;">Verification ${isApproved ? 'Approved' : 'Rejected'}</h2>
        
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Dear ${name},<br/>
          Your request for <strong>${service}</strong> has been <strong>${status}</strong>.
        </p>
        
        ${reasonHtml}
        
        <p style="color: #475569; font-size: 14px; margin-top: 20px;">
          ${isApproved ? 'Your service is now live and can be booked by others.' : 'Please review the feedback and resubmit from your dashboard.'}
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">Travel Companion — Pakistan's Travel Planning Platform</p>
      </div>
    `,
  }, true);
};

/**
 * Send emergency alert email
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
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 95%; max-width: 480px; margin: 0 auto; padding: 24px 16px; background: #fffcfc; border: 2px solid #ef4444; border-radius: 12px; box-sizing: border-box;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: #ef4444; color: white; font-size: 28px; font-weight: bold; line-height: 56px;">
            🚨
          </div>
        </div>
        
        <h2 style="color: #991b1b; margin-top: 0; margin-bottom: 12px; text-align: center; font-size: 18px; font-weight: 900; text-transform: uppercase;">Emergency Alert</h2>
        
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          Dear <strong>${contactName}</strong>,<br/>
          <strong>${travelerName}</strong> has triggered an emergency panic alert. They listed you as a trusted contact.
        </p>
        
        <div style="margin: 20px 0; padding: 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px;">
          <h3 style="margin-top: 0; margin-bottom: 8px; color: #991b1b; font-size: 15px;">Last Known Location</h3>
          <p style="margin: 4px 0; color: #7f1d1d; font-size: 14px;"><strong>Address:</strong><br/> ${addressText}</p>
          <p style="margin: 10px 0 4px 0; color: #7f1d1d; font-size: 14px;"><strong>Coordinates:</strong><br/> ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</p>
        </div>
        
        <div style="text-align: center;">
          <a href="${mapLink}" style="display: block; width: 100%; text-align: center; margin: 20px 0; padding: 14px 0; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; text-transform: uppercase;">
            Open Google Maps
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 13px; text-align: center;">
          Please attempt to contact them immediately.
        </p>
        
        <hr style="border: none; border-top: 1px solid #fca5a5; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">Automated Emergency Alert via Travel Companion</p>
      </div>
    `,
  }, true);
};
