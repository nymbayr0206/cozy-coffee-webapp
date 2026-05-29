import base64
import hashlib
import hmac
import secrets
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class CozyLoyaltyStampRule(models.Model):
    _name = "cozy.loyalty.stamp.rule"
    _description = "Cozy Coffee Loyalty Stamp Rule"
    _order = "sequence asc, name asc"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)
    stamp_per_unit = fields.Integer(default=1, required=True)
    pos_category_ids = fields.Many2many(
        "pos.category",
        "cozy_loyalty_rule_pos_category_rel",
        "rule_id",
        "category_id",
        string="POS Categories",
    )
    product_category_ids = fields.Many2many(
        "product.category",
        "cozy_loyalty_rule_product_category_rel",
        "rule_id",
        "category_id",
        string="Product Categories",
    )
    product_ids = fields.Many2many(
        "product.product",
        "cozy_loyalty_rule_product_rel",
        "rule_id",
        "product_id",
        string="Products",
    )

    @api.constrains("stamp_per_unit")
    def _check_stamp_per_unit(self):
        for rule in self:
            if rule.stamp_per_unit <= 0:
                raise ValidationError("Stamp per unit must be greater than 0.")

    def _payload(self):
        self.ensure_one()
        return {
            "id": self.id,
            "name": self.name,
            "stamp_per_unit": self.stamp_per_unit,
            "pos_category_ids": self.pos_category_ids.ids,
            "pos_category_names": self.pos_category_ids.mapped("display_name"),
            "product_category_ids": self.product_category_ids.ids,
            "product_category_names": self.product_category_ids.mapped("display_name"),
            "product_ids": self.product_ids.ids,
        }

    def _matches_product(self, product):
        self.ensure_one()
        if not product:
            return False

        if self.product_ids and product.id in self.product_ids.ids:
            return True

        product_category_id = product.categ_id.id if product.categ_id else False
        if self.product_category_ids and product_category_id in self.product_category_ids.ids:
            return True

        pos_category_ids = set()
        if "pos_categ_ids" in product._fields:
            pos_category_ids.update(product.pos_categ_ids.ids)
        if product.product_tmpl_id and "pos_categ_ids" in product.product_tmpl_id._fields:
            pos_category_ids.update(product.product_tmpl_id.pos_categ_ids.ids)

        return bool(self.pos_category_ids and pos_category_ids.intersection(set(self.pos_category_ids.ids)))


class CozyLoyaltyStampCard(models.Model):
    _name = "cozy.loyalty.stamp.card"
    _description = "Cozy Coffee Loyalty Stamp Card"
    _order = "rule_id, id"

    member_id = fields.Many2one("cozy.loyalty.member", required=True, ondelete="cascade", index=True)
    rule_id = fields.Many2one("cozy.loyalty.stamp.rule", required=True, ondelete="cascade", index=True)
    stamp_count = fields.Integer(default=0)
    active = fields.Boolean(default=True)

    _sql_constraints = [
        ("member_rule_unique", "unique(member_id, rule_id)", "This member already has a stamp card for this rule."),
    ]


class CozyLoyaltyMember(models.Model):
    _name = "cozy.loyalty.member"
    _description = "Cozy Coffee Loyalty Member"
    _rec_name = "display_name"

    partner_id = fields.Many2one("res.partner", required=True, ondelete="cascade", index=True)
    display_name = fields.Char(related="partner_id.display_name", store=True)
    phone = fields.Char(required=True, index=True)
    pin_hash = fields.Char(required=True)
    stamp_count = fields.Integer(default=0)
    active = fields.Boolean(default=True)
    coupon_ids = fields.One2many("cozy.loyalty.coupon", "member_id")
    stamp_card_ids = fields.One2many("cozy.loyalty.stamp.card", "member_id")

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

    def _ensure_stamp_cards(self):
        self.ensure_one()
        rules = self.env["cozy.loyalty.stamp.rule"].search([("active", "=", True)])
        Card = self.env["cozy.loyalty.stamp.card"].sudo()
        existing_by_rule = {card.rule_id.id: card for card in self.stamp_card_ids if card.rule_id}
        had_cards = bool(existing_by_rule)

        for rule in rules:
            if rule.id not in existing_by_rule:
                existing_by_rule[rule.id] = Card.create({
                    "member_id": self.id,
                    "rule_id": rule.id,
                    "stamp_count": 0,
                })

        if not had_cards and self.stamp_count > 0 and rules:
            first_card = existing_by_rule.get(rules[0].id)
            if first_card and first_card.stamp_count == 0:
                first_card.stamp_count = self.stamp_count

        return Card.browse([existing_by_rule[rule.id].id for rule in rules if rule.id in existing_by_rule])

    def _stamp_card_payload(self, card):
        return {
            "id": card.id,
            "rule_id": card.rule_id.id,
            "name": card.rule_id.name,
            "stamp_count": card.stamp_count,
            "stamp_target": 9,
            "stamp_per_unit": card.rule_id.stamp_per_unit,
        }

    def _wallet_payload(self):
        self.ensure_one()
        stamp_cards = self._ensure_stamp_cards()
        primary_stamp_count = stamp_cards[0].stamp_count if stamp_cards else self.stamp_count
        coupons = self.coupon_ids.sorted(lambda item: item.create_date or fields.Datetime.now(), reverse=True)
        return {
            "member": {
                "id": self.id,
                "partner_id": self.partner_id.id,
                "name": self.partner_id.display_name,
                "phone": self.phone,
                "stamp_count": primary_stamp_count,
            },
            "stamp_cards": [self._stamp_card_payload(card) for card in stamp_cards],
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
            if not member._check_pin(pin):
                raise ValidationError("Wrong transaction PIN.")
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
        if not member or not member._check_pin(pin):
            raise ValidationError("Phone number or transaction PIN is wrong.")
        return member._wallet_payload()

    @api.model
    def api_wallet(self, member_id):
        member = self.browse(int(member_id)).exists()
        if not member or not member.active:
            raise ValidationError("Loyalty member not found.")
        return member._wallet_payload()

    @api.model
    def api_stamp_rules(self):
        rules = self.env["cozy.loyalty.stamp.rule"].search([("active", "=", True)])
        return {"ok": True, "rules": [rule._payload() for rule in rules]}

    @api.model
    def _stamp_quantities_from_lines(self, lines):
        rules = self.env["cozy.loyalty.stamp.rule"].search([("active", "=", True)])
        if not rules or not lines:
            return {}

        quantities = {}
        for line in lines:
            product = self.env["product.product"].browse(int((line or {}).get("product_id") or 0)).exists()
            quantity = int(float((line or {}).get("quantity") or 0))
            if not product or quantity <= 0:
                continue

            for rule in rules:
                if rule._matches_product(product):
                    quantities[rule.id] = quantities.get(rule.id, 0) + (quantity * rule.stamp_per_unit)
                    break

        return quantities

    @api.model
    def api_record_purchase(self, values):
        values = values or {}
        member = self.browse(int(values.get("member_id") or 0)).exists()
        if not member and values.get("phone"):
            member = self.search([("phone", "=", self._normalize_phone(values.get("phone")))], limit=1)
        if not member or not member.active:
            raise ValidationError("Loyalty member not found.")

        quantities = self._stamp_quantities_from_lines(values.get("lines") or [])
        legacy_quantity = 0
        if not quantities:
            fallback_quantity = int(values.get("coffee_quantity") or 0)
            if fallback_quantity > 0:
                first_rule = self.env["cozy.loyalty.stamp.rule"].search([("active", "=", True)], limit=1)
                if first_rule:
                    quantities[first_rule.id] = fallback_quantity
                else:
                    legacy_quantity = fallback_quantity

        total_quantity = sum(quantities.values()) + legacy_quantity
        if total_quantity <= 0:
            payload = member._wallet_payload()
            payload["stamp_quantity"] = 0
            payload["stamp_quantities"] = {}
            return payload

        if legacy_quantity > 0:
            member.stamp_count += legacy_quantity
            while member.stamp_count >= 9:
                member.stamp_count -= 9
                member._create_reward_coupon()

        if quantities:
            stamp_cards = member._ensure_stamp_cards()
            cards_by_rule = {card.rule_id.id: card for card in stamp_cards if card.rule_id}
            for rule_id, quantity in quantities.items():
                card = cards_by_rule.get(rule_id)
                if not card:
                    card = self.env["cozy.loyalty.stamp.card"].sudo().create({
                        "member_id": member.id,
                        "rule_id": rule_id,
                        "stamp_count": 0,
                    })
                card.stamp_count += quantity
                while card.stamp_count >= 9:
                    card.stamp_count -= 9
                    member._create_reward_coupon()

            refreshed_cards = member._ensure_stamp_cards()
            if refreshed_cards:
                member.stamp_count = refreshed_cards[0].stamp_count

        payload = member._wallet_payload()
        payload["stamp_quantity"] = total_quantity
        payload["stamp_quantities"] = {str(rule_id): quantity for rule_id, quantity in quantities.items()}
        return payload

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
        coupon = self.browse(int(parts[1])).exists()
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
