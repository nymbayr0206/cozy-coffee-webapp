import base64
import hashlib
import hmac
import secrets
from datetime import datetime, time, timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class CozyLoyaltyMember(models.Model):
    _name = "cozy.loyalty.member"
    _description = "Cozy Coffee Loyalty Member"
    _rec_name = "display_name"

    partner_id = fields.Many2one("res.partner", required=True, ondelete="cascade", index=True)
    display_name = fields.Char(related="partner_id.display_name", store=True)
    phone = fields.Char(required=True, index=True)
    pin_hash = fields.Char()
    qr_secret = fields.Char()
    stamp_count = fields.Integer(default=0)
    marketing_opt_in = fields.Boolean(default=True)
    last_purchase_at = fields.Datetime()
    active = fields.Boolean(default=True)
    coupon_ids = fields.One2many("cozy.loyalty.coupon", "member_id")
    notification_message_ids = fields.One2many("cozy.notification.message", "member_id")

    _sql_constraints = [
        ("phone_unique", "unique(phone)", "This phone number already has a loyalty member."),
    ]

    @api.model
    def _normalize_phone(self, phone):
        return "".join(ch for ch in str(phone or "") if ch.isdigit() or ch == "+")

    @api.model
    def _hash_pin(self, pin, salt=None):
        if not pin or len(str(pin)) < 4:
            raise ValidationError("PIN must contain at least 4 characters.")
        salt_bytes = base64.b64decode(salt) if salt else secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", str(pin).encode("utf-8"), salt_bytes, 160000)
        return "%s$%s" % (
            base64.b64encode(salt_bytes).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        )

    def _check_pin(self, pin):
        self.ensure_one()
        if not self.pin_hash:
            return False
        try:
            salt, expected = self.pin_hash.split("$", 1)
        except ValueError:
            return False
        return hmac.compare_digest(self._hash_pin(pin, salt), "%s$%s" % (salt, expected))

    def _coupon_payload(self, coupon):
        return {
            "id": coupon.id,
            "code": coupon.code,
            "state": coupon.state,
            "reward_product_id": coupon.reward_product_id.id,
            "reward_product_name": coupon.reward_product_id.display_name,
            "created_at": fields.Datetime.to_string(coupon.create_date) if coupon.create_date else None,
            "expires_at": fields.Datetime.to_string(coupon.expires_at) if coupon.expires_at else None,
            "used_at": fields.Datetime.to_string(coupon.used_at) if coupon.used_at else None,
        }

    def _member_payload(self):
        self.ensure_one()
        return {
            "id": self.id,
            "partner_id": self.partner_id.id,
            "name": self.partner_id.display_name,
            "phone": self.phone,
            "stamp_count": self.stamp_count,
            "marketing_opt_in": self.marketing_opt_in,
            "last_purchase_at": fields.Datetime.to_string(self.last_purchase_at) if self.last_purchase_at else None,
        }

    def _wallet_payload(self):
        self.ensure_one()
        coupons = self.coupon_ids.sorted(lambda item: item.create_date or fields.Datetime.now(), reverse=True)
        return {
            "member": self._member_payload(),
            "coupons": [self._coupon_payload(coupon) for coupon in coupons],
        }

    @api.model
    def _reward_product(self):
        product_id = int(self.env["ir.config_parameter"].sudo().get_param("cozy_loyalty.reward_product_id") or 0)
        product = self.env["product.product"].browse(product_id).exists()
        if not product:
            product = self.env["product.product"].search([("default_code", "=", "COZY-FREE-COFFEE-COUPON")], limit=1)
        if not product:
            raise UserError("Cozy loyalty reward product is missing. Upgrade cozy_loyalty module.")
        return product

    def _create_reward_coupon(self):
        self.ensure_one()
        return self.env["cozy.loyalty.coupon"].create({
            "member_id": self.id,
            "reward_product_id": self._reward_product().id,
            "code": "COZY-%s" % secrets.token_urlsafe(6).replace("-", "").replace("_", "").upper()[:8],
            "qr_secret": secrets.token_urlsafe(24),
            "expires_at": fields.Datetime.now() + timedelta(days=365),
        })

    def _ensure_qr_secret(self):
        self.ensure_one()
        if not self.qr_secret:
            self.qr_secret = secrets.token_urlsafe(24)
        return self.qr_secret

    def member_qr_token(self):
        self.ensure_one()
        return "COZY-MEMBER:%s:%s" % (self.id, self._ensure_qr_secret())

    @api.model
    def _find_member_by_token(self, qr_token):
        parts = str(qr_token or "").strip().split(":")
        if len(parts) != 3 or parts[0] != "COZY-MEMBER":
            raise ValidationError("Invalid Cozy member QR.")
        try:
            member_id = int(parts[1])
        except (TypeError, ValueError):
            raise ValidationError("Invalid Cozy member QR.")
        member = self.browse(member_id).exists()
        if not member or not member.qr_secret or not hmac.compare_digest(member.qr_secret, parts[2]):
            raise ValidationError("Invalid Cozy member QR.")
        if not member.active:
            raise ValidationError("Loyalty member is inactive.")
        return member

    @api.model
    def _stamp_quantity_from_lines(self, lines):
        lines = lines or []
        if not isinstance(lines, list):
            return 0

        product_ids = []
        normalized_lines = []
        for line in lines:
            if not isinstance(line, dict):
                continue
            product_id = int(line.get("product_id") or 0)
            quantity = float(line.get("quantity") or line.get("qty") or 0)
            if product_id > 0 and quantity > 0:
                product_ids.append(product_id)
                normalized_lines.append({"product_id": product_id, "quantity": quantity})

        if not normalized_lines:
            return 0

        products = {product.id: product for product in self.env["product.product"].browse(product_ids).exists()}
        rule_model = self.env["cozy.loyalty.stamp.rule"]
        total = 0.0
        for line in normalized_lines:
            product = products.get(line["product_id"])
            if product:
                total += rule_model.stamps_for_product(product, line["quantity"])

        return int(total)

    @api.model
    def api_register(self, values):
        values = values or {}
        phone = self._normalize_phone(values.get("phone"))
        name = str(values.get("name") or "").strip() or phone
        pin = values.get("pin")

        if not phone:
            raise ValidationError("phone is required.")

        member = self.search([("phone", "=", phone)], limit=1)
        if member:
            if member.pin_hash and not member._check_pin(pin):
                raise ValidationError("Wrong transaction PIN.")
            if not member.pin_hash:
                member.pin_hash = self._hash_pin(pin)
            if name and member.partner_id.name != name:
                member.partner_id.write({"name": name})
            return member._wallet_payload()

        partner = self.env["res.partner"].create({
            "name": name,
            "phone": phone,
            "customer_rank": 1,
        })
        member = self.create({
            "partner_id": partner.id,
            "phone": phone,
            "pin_hash": self._hash_pin(pin),
        })
        return member._wallet_payload()

    @api.model
    def api_login(self, phone, pin):
        normalized_phone = self._normalize_phone(phone)
        member = self.search([("phone", "=", normalized_phone), ("active", "=", True)], limit=1)
        if not member or not member.pin_hash or not member._check_pin(pin):
            raise ValidationError("Phone number or transaction PIN is wrong.")
        return member._wallet_payload()

    @api.model
    def api_wallet(self, member_id):
        member = self.browse(int(member_id)).exists()
        if not member or not member.active:
            raise ValidationError("Loyalty member not found.")
        return member._wallet_payload()

    @api.model
    def api_record_purchase(self, values):
        values = values or {}
        member = self.browse(int(values.get("member_id") or 0)).exists()
        member_qr_token = values.get("member_qr_token")
        if not member and member_qr_token:
            member = self._find_member_by_token(member_qr_token)
        phone = self._normalize_phone(values.get("phone"))
        if not member and phone:
            member = self.search([("phone", "=", phone)], limit=1)
        if not member and phone:
            partner = self.env["res.partner"].search([("phone", "=", phone)], limit=1)
            if not partner:
                partner = self.env["res.partner"].create({
                    "name": phone,
                    "phone": phone,
                    "customer_rank": 1,
                })
            member = self.create({
                "partner_id": partner.id,
                "phone": phone,
            })
        if not member or not member.active:
            raise ValidationError("Loyalty member not found.")

        quantity = self._stamp_quantity_from_lines(values.get("lines"))
        if quantity <= 0:
            quantity = int(values.get("coffee_quantity") or 0)
        if quantity <= 0:
            return member._wallet_payload()

        member.last_purchase_at = fields.Datetime.now()
        member.stamp_count += quantity
        while member.stamp_count >= 9:
            member.stamp_count -= 9
            member._create_reward_coupon()

        return member._wallet_payload()

    @api.model
    def api_create_member_qr(self, member_id):
        member = self.browse(int(member_id)).exists()
        if not member or not member.active:
            raise ValidationError("Loyalty member not found.")
        return {
            "member": member._member_payload(),
            "qr_token": member.member_qr_token(),
        }

    @api.model
    def api_member_from_qr(self, qr_token):
        member = self._find_member_by_token(qr_token)
        return {
            "ok": True,
            "member": member._member_payload(),
        }

    @api.model
    def api_create_coupon_qr(self, member_id, coupon_id):
        member = self.browse(int(member_id)).exists()
        coupon = self.env["cozy.loyalty.coupon"].browse(int(coupon_id)).exists()
        if not member or not coupon or coupon.member_id.id != member.id:
            raise ValidationError("Coupon not found.")
        if coupon.state != "available":
            raise ValidationError("Coupon is not available.")
        if coupon.expires_at and coupon.expires_at < fields.Datetime.now():
            coupon.state = "expired"
            raise ValidationError("Coupon has expired.")
        return {
            "coupon": member._coupon_payload(coupon),
            "qr_token": coupon.qr_token(),
        }

    @api.model
    def api_update_notification_settings(self, member_id, values):
        member = self.browse(int(member_id)).exists()
        if not member or not member.active:
            raise ValidationError("Loyalty member not found.")
        if "marketing_opt_in" in (values or {}):
            member.marketing_opt_in = bool(values.get("marketing_opt_in"))
        return member._wallet_payload()


class CozyLoyaltyStampRule(models.Model):
    _name = "cozy.loyalty.stamp.rule"
    _description = "Cozy Coffee Loyalty Stamp Rule"
    _order = "sequence, id"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)
    product_ids = fields.Many2many("product.product", string="Stamp products")
    pos_category_ids = fields.Many2many("pos.category", string="POS categories")
    product_category_ids = fields.Many2many("product.category", string="Product categories")
    stamp_per_unit = fields.Float(default=1.0, required=True)

    def _product_pos_categories(self, product):
        if "pos_categ_ids" in product._fields:
            return product.pos_categ_ids
        template = product.product_tmpl_id
        if template and "pos_categ_ids" in template._fields:
            return template.pos_categ_ids
        return self.env["pos.category"]

    def _matches_product(self, product):
        self.ensure_one()
        if self.product_ids and product in self.product_ids:
            return True
        if self.product_category_ids and product.categ_id in self.product_category_ids:
            return True
        pos_categories = self._product_pos_categories(product)
        if self.pos_category_ids and any(category in self.pos_category_ids for category in pos_categories):
            return True
        return not self.product_ids and not self.product_category_ids and not self.pos_category_ids

    @api.model
    def stamps_for_product(self, product, quantity):
        rules = self.search([("active", "=", True)])
        for rule in rules:
            if rule._matches_product(product):
                return max(0.0, float(quantity or 0) * rule.stamp_per_unit)
        return 0.0


class CozyLoyaltyCoupon(models.Model):
    _name = "cozy.loyalty.coupon"
    _description = "Cozy Coffee Loyalty Coupon"
    _order = "create_date desc, id desc"

    member_id = fields.Many2one("cozy.loyalty.member", required=True, ondelete="cascade", index=True)
    partner_id = fields.Many2one(related="member_id.partner_id", store=True)
    reward_product_id = fields.Many2one("product.product", required=True)
    code = fields.Char(required=True, index=True)
    qr_secret = fields.Char(required=True)
    state = fields.Selection(
        [("available", "Available"), ("used", "Used"), ("expired", "Expired"), ("cancelled", "Cancelled")],
        default="available",
        required=True,
        index=True,
    )
    expires_at = fields.Datetime()
    used_at = fields.Datetime()
    used_order_ref = fields.Char()
    used_session_id = fields.Char()
    used_cashier_name = fields.Char()

    _sql_constraints = [
        ("code_unique", "unique(code)", "Coupon code must be unique."),
    ]

    def qr_token(self):
        self.ensure_one()
        return "COZY:%s:%s" % (self.id, self.qr_secret)

    @api.model
    def _find_by_token(self, qr_token):
        parts = str(qr_token or "").strip().split(":")
        if len(parts) != 3 or parts[0] != "COZY":
            raise ValidationError("Invalid Cozy coupon QR.")
        try:
            coupon_id = int(parts[1])
        except (TypeError, ValueError):
            raise ValidationError("Invalid Cozy coupon QR.")
        coupon = self.browse(coupon_id).exists()
        if not coupon or not hmac.compare_digest(coupon.qr_secret, parts[2]):
            raise ValidationError("Invalid Cozy coupon QR.")
        return coupon

    def _validate_available(self, pin):
        self.ensure_one()
        if self.state != "available":
            raise ValidationError("Coupon is already used or unavailable.")
        if self.expires_at and self.expires_at < fields.Datetime.now():
            self.state = "expired"
            raise ValidationError("Coupon has expired.")
        if not self.member_id._check_pin(pin):
            raise ValidationError("Wrong transaction PIN.")
        return True

    @api.model
    def api_validate_coupon(self, qr_token, pin):
        coupon = self._find_by_token(qr_token)
        coupon._validate_available(pin)
        return {
            "ok": True,
            "coupon_id": coupon.id,
            "code": coupon.code,
            "member_id": coupon.member_id.id,
            "partner_id": coupon.partner_id.id,
            "partner_name": coupon.partner_id.display_name,
            "reward_product_id": coupon.reward_product_id.id,
            "reward_product_name": coupon.reward_product_id.display_name,
        }

    @api.model
    def api_redeem_coupon(self, values):
        values = values or {}
        coupon = self._find_by_token(values.get("qr_token"))
        coupon._validate_available(values.get("pin"))
        coupon.write({
            "state": "used",
            "used_at": fields.Datetime.now(),
            "used_order_ref": values.get("order_ref") or False,
            "used_session_id": values.get("session_id") or False,
            "used_cashier_name": values.get("cashier_name") or False,
        })
        return {
            "ok": True,
            "coupon_id": coupon.id,
            "code": coupon.code,
            "partner_id": coupon.partner_id.id,
            "partner_name": coupon.partner_id.display_name,
            "reward_product_id": coupon.reward_product_id.id,
            "reward_product_name": coupon.reward_product_id.display_name,
            "state": coupon.state,
        }


class CozyNotificationCampaign(models.Model):
    _name = "cozy.notification.campaign"
    _description = "Cozy Coffee Notification Campaign"
    _order = "scheduled_at desc, id desc"

    name = fields.Char(required=True)
    title = fields.Char(required=True)
    message = fields.Text(required=True)
    image = fields.Binary(attachment=True)
    image_filename = fields.Char()
    scheduled_at = fields.Datetime(required=True, default=fields.Datetime.now)
    target_segment = fields.Selection(
        [
            ("all_registered", "All registered users"),
            ("available_coupon", "Users with available coupon"),
            ("close_reward", "Users close to free coffee"),
            ("inactive_7", "Inactive for 7 days"),
            ("inactive_14", "Inactive for 14 days"),
            ("inactive_30", "Inactive for 30 days"),
        ],
        required=True,
        default="all_registered",
    )
    campaign_type = fields.Selection(
        [
            ("marketing", "Marketing"),
            ("system", "System"),
        ],
        required=True,
        default="marketing",
    )
    status = fields.Selection(
        [
            ("draft", "Draft"),
            ("scheduled", "Scheduled"),
            ("sent", "Sent"),
            ("failed", "Failed"),
        ],
        required=True,
        default="draft",
        index=True,
    )
    sent_at = fields.Datetime()
    failed_reason = fields.Text()
    message_ids = fields.One2many("cozy.notification.message", "campaign_id")
    message_count = fields.Integer(compute="_compute_message_count")

    def _compute_message_count(self):
        grouped = self.env["cozy.notification.message"].read_group(
            [("campaign_id", "in", self.ids)],
            ["campaign_id"],
            ["campaign_id"],
        )
        counts = {row["campaign_id"][0]: row["campaign_id_count"] for row in grouped}
        for campaign in self:
            campaign.message_count = counts.get(campaign.id, 0)

    @api.model
    def _send_due_campaigns(self):
        campaigns = self.search([
            ("status", "=", "scheduled"),
            ("scheduled_at", "<=", fields.Datetime.now()),
        ])
        for campaign in campaigns:
            campaign.action_send()
        return True

    def _registered_member_domain(self):
        domain = [
            ("active", "=", True),
            ("pin_hash", "!=", False),
        ]
        if self.campaign_type == "marketing":
            domain.append(("marketing_opt_in", "=", True))
        return domain

    def _target_members(self):
        self.ensure_one()
        domain = self._registered_member_domain()
        if self.target_segment == "available_coupon":
            domain.append(("coupon_ids.state", "=", "available"))
        elif self.target_segment == "close_reward":
            domain.append(("stamp_count", ">=", 7))
        elif self.target_segment in ("inactive_7", "inactive_14", "inactive_30"):
            days = int(self.target_segment.split("_")[1])
            cutoff = fields.Datetime.now() - timedelta(days=days)
            domain.extend([
                ("last_purchase_at", "!=", False),
                ("last_purchase_at", "<=", cutoff),
            ])
        return self.env["cozy.loyalty.member"].search(domain)

    @api.model
    def _mongolia_day_bounds(self, value=None):
        value = value or fields.Datetime.now()
        local_date = (value + timedelta(hours=8)).date()
        start_local = datetime.combine(local_date, time.min)
        start_utc = start_local - timedelta(hours=8)
        end_utc = start_utc + timedelta(days=1)
        return start_utc, end_utc

    def _marketing_sent_today(self, member):
        self.ensure_one()
        if self.campaign_type != "marketing":
            return False
        start_utc, end_utc = self._mongolia_day_bounds(fields.Datetime.now())
        return bool(self.env["cozy.notification.message"].search_count([
            ("member_id", "=", member.id),
            ("campaign_id.campaign_type", "=", "marketing"),
            ("send_time", ">=", start_utc),
            ("send_time", "<", end_utc),
            ("status", "in", ["sent", "read"]),
        ]))

    def action_send(self):
        message_model = self.env["cozy.notification.message"]
        for campaign in self:
            if campaign.status == "sent":
                continue
            try:
                recipients = campaign._target_members()
                for member in recipients:
                    if campaign._marketing_sent_today(member):
                        continue
                    message_model.create({
                        "campaign_id": campaign.id,
                        "member_id": member.id,
                        "title": campaign.title,
                        "message": campaign.message,
                        "image": campaign.image,
                        "send_time": fields.Datetime.now(),
                        "status": "sent",
                    })
                campaign.write({
                    "status": "sent",
                    "sent_at": fields.Datetime.now(),
                    "failed_reason": False,
                })
            except Exception as error:
                campaign.write({
                    "status": "failed",
                    "failed_reason": str(error),
                })
        return True


class CozyNotificationMessage(models.Model):
    _name = "cozy.notification.message"
    _description = "Cozy Coffee Notification Message"
    _order = "send_time desc, id desc"

    campaign_id = fields.Many2one("cozy.notification.campaign", ondelete="cascade", index=True)
    member_id = fields.Many2one("cozy.loyalty.member", required=True, ondelete="cascade", index=True)
    title = fields.Char(required=True)
    message = fields.Text(required=True)
    image = fields.Binary(attachment=True)
    send_time = fields.Datetime(required=True, default=fields.Datetime.now, index=True)
    read_at = fields.Datetime()
    status = fields.Selection(
        [
            ("sent", "Sent"),
            ("read", "Read"),
            ("failed", "Failed"),
        ],
        required=True,
        default="sent",
        index=True,
    )

    def _payload(self):
        self.ensure_one()
        return {
            "id": self.id,
            "campaign_id": self.campaign_id.id if self.campaign_id else None,
            "title": self.title,
            "message": self.message,
            "image": self.image.decode("ascii") if isinstance(self.image, bytes) else self.image,
            "send_time": fields.Datetime.to_string(self.send_time) if self.send_time else None,
            "read_at": fields.Datetime.to_string(self.read_at) if self.read_at else None,
            "status": self.status,
        }

    @api.model
    def _read_member(self, member_id):
        member = self.env["cozy.loyalty.member"].browse(int(member_id)).exists()
        if not member or not member.active:
            raise ValidationError("Loyalty member not found.")
        return member

    @api.model
    def api_inbox(self, member_id, limit=30):
        member = self._read_member(member_id)
        limit = max(1, min(int(limit or 30), 100))
        domain = [("member_id", "=", member.id)]
        messages = self.search(domain, limit=limit)
        unread_count = self.search_count(domain + [("status", "=", "sent")])
        return {
            "unread_count": unread_count,
            "marketing_opt_in": member.marketing_opt_in,
            "messages": [message._payload() for message in messages],
        }

    @api.model
    def api_mark_read(self, values):
        values = values or {}
        member = self._read_member(values.get("member_id"))
        domain = [("member_id", "=", member.id), ("status", "=", "sent")]
        if not values.get("all"):
            message_ids = [int(item) for item in values.get("message_ids") or []]
            if not message_ids:
                raise ValidationError("message_ids or all is required.")
            domain.append(("id", "in", message_ids))
        messages = self.search(domain)
        messages.write({
            "status": "read",
            "read_at": fields.Datetime.now(),
        })
        return self.api_inbox(member.id)
