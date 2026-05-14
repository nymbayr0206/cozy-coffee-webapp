{
    "name": "Cozy Coffee Loyalty",
    "summary": "9 coffee stamps, free coffee coupons, and PIN-protected QR redemption.",
    "version": "1.0.0",
    "category": "Sales/Point of Sale",
    "author": "Cozy Coffee",
    "license": "LGPL-3",
    "depends": ["base", "product", "sale", "point_of_sale"],
    "data": [
        "security/ir.model.access.csv",
        "data/notification_cron.xml",
        "views/loyalty_views.xml",
    ],
    "post_init_hook": "post_init_hook",
    "installable": True,
    "application": False,
}
