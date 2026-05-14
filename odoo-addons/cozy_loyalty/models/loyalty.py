import base64
import hashlib
import hmac
import secrets
from datetime import timedelta

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
    active = fields.Boolean(default=True)
    coupon_ids = fields.One2many("cozy.loyalty.coupon", "member_id")

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
