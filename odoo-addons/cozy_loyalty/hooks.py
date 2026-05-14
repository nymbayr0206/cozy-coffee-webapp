def post_init_hook(env):
    product_category = env["product.category"].search([("name", "=", "Coupon")], limit=1)
    if not product_category:
        product_category = env["product.category"].create({"name": "Coupon"})

    pos_category = env["pos.category"].search([("name", "=", "Coupon")], limit=1)
    if not pos_category:
        pos_category = env["pos.category"].create({"name": "Coupon"})

    product = env["product.product"].search([("default_code", "=", "COZY-FREE-COFFEE-COUPON")], limit=1)
    values = {
        "name": "1 үнэгүй кофе",
        "default_code": "COZY-FREE-COFFEE-COUPON",
        "type": "service",
        "sale_ok": True,
        "list_price": 0.0,
        "categ_id": product_category.id,
    }

    if "available_in_pos" in env["product.product"]._fields:
        values["available_in_pos"] = True
    if "pos_categ_ids" in env["product.product"]._fields:
        values["pos_categ_ids"] = [(6, 0, [pos_category.id])]

    if product:
        product.write(values)
    else:
        product = env["product.product"].create(values)

    env["ir.config_parameter"].sudo().set_param("cozy_loyalty.reward_product_id", str(product.id))
