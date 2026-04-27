"""Controlled vocabulary for audit log action and entity types.

Import AuditAction for action values and AuditEntity for entity_type values.
All values are SCREAMING_SNAKE_CASE strings — kept as class constants (not Enum)
to avoid overhead and allow simple string comparison in filters.
"""


class AuditAction:
    # ── Authentication ────────────────────────────────────────────────────────
    REGISTER                    = "REGISTER"
    LOGIN_SUCCESS               = "LOGIN_SUCCESS"
    LOGIN_FAILED                = "LOGIN_FAILED"
    LOGOUT                      = "LOGOUT"
    OTP_VERIFIED                = "OTP_VERIFIED"
    TRUSTED_DEVICE_REGISTERED   = "TRUSTED_DEVICE_REGISTERED"
    TRUSTED_DEVICE_LOGIN        = "TRUSTED_DEVICE_LOGIN"
    PASSWORD_RESET_REQUESTED    = "PASSWORD_RESET_REQUESTED"
    PASSWORD_RESET_COMPLETED    = "PASSWORD_RESET_COMPLETED"
    PASSWORD_CHANGED            = "PASSWORD_CHANGED"
    PROFILE_UPDATED             = "PROFILE_UPDATED"

    # ── Employer ──────────────────────────────────────────────────────────────
    EMPLOYER_CREATED            = "EMPLOYER_CREATED"
    EMPLOYER_UPDATED            = "EMPLOYER_UPDATED"
    EMPLOYER_DELETED            = "EMPLOYER_DELETED"
    EMPLOYER_ACTIVATED          = "EMPLOYER_ACTIVATED"
    EMPLOYER_DEACTIVATED        = "EMPLOYER_DEACTIVATED"

    # ── Job Position ──────────────────────────────────────────────────────────
    POSITION_CREATED            = "POSITION_CREATED"
    POSITION_UPDATED            = "POSITION_UPDATED"
    POSITION_DELETED            = "POSITION_DELETED"
    POSITION_ACTIVATED          = "POSITION_ACTIVATED"
    POSITION_DEACTIVATED        = "POSITION_DEACTIVATED"

    # ── Job Board URL (Posting) ───────────────────────────────────────────────
    POSTING_CREATED             = "POSTING_CREATED"
    POSTING_UPDATED             = "POSTING_UPDATED"
    POSTING_DELETED             = "POSTING_DELETED"
    POSTING_ACTIVATED           = "POSTING_ACTIVATED"
    POSTING_DEACTIVATED         = "POSTING_DEACTIVATED"

    # ── Capture ───────────────────────────────────────────────────────────────
    CAPTURE_TRIGGERED             = "CAPTURE_TRIGGERED"
    CAPTURE_COMPLETED             = "CAPTURE_COMPLETED"
    CAPTURE_FAILED                = "CAPTURE_FAILED"
    CAPTURE_RESULT_RECAPTURED     = "CAPTURE_RESULT_RECAPTURED"
    MANUAL_SCREENSHOT_UPLOADED    = "MANUAL_SCREENSHOT_UPLOADED"

    # ── Reports / Documents ───────────────────────────────────────────────────
    REPORT_GENERATED            = "REPORT_GENERATED"
    REPORT_EARLY_ACKNOWLEDGED   = "REPORT_EARLY_ACKNOWLEDGED"
    DOCUMENT_UPLOADED           = "DOCUMENT_UPLOADED"
    DOCUMENT_DELETED            = "DOCUMENT_DELETED"

    # ── Billing ───────────────────────────────────────────────────────────────
    CHECKOUT_INITIATED          = "CHECKOUT_INITIATED"
    SUBSCRIPTION_ACTIVATED      = "SUBSCRIPTION_ACTIVATED"
    SUBSCRIPTION_RENEWED        = "SUBSCRIPTION_RENEWED"
    SUBSCRIPTION_UPDATED        = "SUBSCRIPTION_UPDATED"
    SUBSCRIPTION_CANCELLED      = "SUBSCRIPTION_CANCELLED"
    SUBSCRIPTION_EXPIRED        = "SUBSCRIPTION_EXPIRED"
    SUBSCRIPTION_PLAN_CHANGED   = "SUBSCRIPTION_PLAN_CHANGED"
    PAYMENT_SUCCEEDED           = "PAYMENT_SUCCEEDED"
    PAYMENT_FAILED              = "PAYMENT_FAILED"
    PROMO_REDEEMED              = "PROMO_REDEEMED"

    # ── Organization ─────────────────────────────────────────────────────────
    ORG_CREATED                 = "ORG_CREATED"
    ORG_DELETED                 = "ORG_DELETED"
    ORG_MEMBER_ADDED            = "ORG_MEMBER_ADDED"
    ORG_MEMBER_REMOVED          = "ORG_MEMBER_REMOVED"
    ORG_MEMBER_ROLE_CHANGED     = "ORG_MEMBER_ROLE_CHANGED"
    ORG_INVITATION_SENT         = "ORG_INVITATION_SENT"
    ORG_INVITATION_ACCEPTED     = "ORG_INVITATION_ACCEPTED"

    # ── Admin ─────────────────────────────────────────────────────────────────
    USER_ADMIN_GRANTED          = "USER_ADMIN_GRANTED"
    USER_ADMIN_REVOKED          = "USER_ADMIN_REVOKED"
    USER_TIER_ASSIGNED          = "USER_TIER_ASSIGNED"
    USER_DELETED_BY_ADMIN       = "USER_DELETED_BY_ADMIN"
    ORG_DELETED_BY_ADMIN        = "ORG_DELETED_BY_ADMIN"
    TIER_CREATED                = "TIER_CREATED"
    TIER_UPDATED                = "TIER_UPDATED"
    TIER_DEACTIVATED            = "TIER_DEACTIVATED"
    PROMO_CREATED               = "PROMO_CREATED"
    PROMO_UPDATED               = "PROMO_UPDATED"
    PROMO_DEACTIVATED           = "PROMO_DEACTIVATED"


class AuditEntity:
    USER                = "user"
    EMPLOYER            = "employer"
    POSITION            = "position"
    POSTING             = "posting"
    CAPTURE_ROUND       = "capture_round"
    REPORT              = "report"
    DOCUMENT            = "document"
    ORGANIZATION        = "organization"
    ORG_MEMBER          = "org_member"
    ORG_INVITATION      = "org_invitation"
    SUBSCRIPTION        = "subscription"
    SUBSCRIPTION_TIER   = "subscription_tier"
    PROMOTION           = "promotion"
