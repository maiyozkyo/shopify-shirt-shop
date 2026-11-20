"""Applies the Saigon Thread look to the stock Dawn theme in ./theme. Re-runnable.
Usage: python scripts/customize-theme.py
"""
import json
from pathlib import Path

THEME = Path(__file__).resolve().parent.parent / "theme"


def load(rel):
    return json.loads((THEME / rel).read_text(encoding="utf-8"))


def save(rel, data):
    (THEME / rel).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------- global settings: palette, type, shapes
settings = load("config/settings_data.json")
preset = settings["presets"]["Dawn"]
schemes = {
    # cream page, ink text
    "scheme-1": dict(background="#FBF8F3", text="#1F2421", button="#1F2421", button_label="#FBF8F3", secondary_button_label="#1F2421", shadow="#1F2421"),
    # sand panel
    "scheme-2": dict(background="#F1E8DA", text="#1F2421", button="#1F2421", button_label="#F1E8DA", secondary_button_label="#1F2421", shadow="#1F2421"),
    # deep navy
    "scheme-3": dict(background="#1F2D4A", text="#F4F2EE", button="#E3A84B", button_label="#1F2421", secondary_button_label="#F4F2EE", shadow="#121212"),
    # ink
    "scheme-4": dict(background="#1F2421", text="#F4F2EE", button="#F4F2EE", button_label="#1F2421", secondary_button_label="#F4F2EE", shadow="#121212"),
    # terracotta accent
    "scheme-5": dict(background="#B85C38", text="#FFFFFF", button="#FFFFFF", button_label="#B85C38", secondary_button_label="#FFFFFF", shadow="#121212"),
}
for k, v in schemes.items():
    preset["color_schemes"][k]["settings"].update(v)
preset.update(
    type_header_font="playfair_display_n7",
    type_body_font="work_sans_n4",
    heading_scale=110,
    page_width=1300,
    buttons_radius=40,
    inputs_radius=8,
    card_corner_radius=12,
    product_card_corner_radius=12,
    collection_card_corner_radius=12,
    variant_pills_radius=40,
    animations_hover_elements="vertical-lift",
    cart_type="drawer",
    predictive_search_enabled=True,
)
settings["current"] = "Dawn"
save("config/settings_data.json", settings)

# ---------- header: announcement + header
header = load("sections/header-group.json")
bar = header["sections"]["announcement-bar"]
bar["settings"].update(color_scheme="scheme-3", auto_rotate=True, change_slides_speed=5)
bar["blocks"] = {
    f"msg-{i}": {"type": "announcement", "settings": {"text": t, "text_alignment": "center", "color_scheme": "scheme-3", "link": l}}
    for i, (t, l) in enumerate([
        ("Free shipping on orders over $50", "shopify://collections/all"),
        ("Demo store: test checkout only, nothing ships", ""),
        ("Easy 30-day returns", ""),
    ])
}
bar["block_order"] = list(bar["blocks"])
header["sections"]["header"]["settings"].update(
    logo_position="middle-left", menu_type_desktop="dropdown", sticky_header_type="always",
    enable_country_selector=False, enable_language_selector=False,
)
save("sections/header-group.json", header)

# ---------- footer
footer = load("sections/footer-group.json")
f = footer["sections"]["footer"]
f["settings"].update(color_scheme="scheme-4", newsletter_heading="Get new drops first",
                     enable_country_selector=False, enable_language_selector=False, enable_follow_on_shop=False)
f["blocks"] = {
    "about": {"type": "text", "settings": {"heading": "Saigon Thread", "subtext": "<p>Breathable basics for hot days and cool evenings. A fictional brand built as a Shopify demo store.</p>"}},
    "links": {"type": "link_list", "settings": {"heading": "Help", "menu": "footer"}},
}
f["block_order"] = ["about", "links"]
save("sections/footer-group.json", footer)

# ---------- homepage
pc = lambda **kw: {"color_scheme": "scheme-1", "padding_top": 48, "padding_bottom": 48, **kw}
featured = lambda title, handle, scheme: {
    "type": "featured-collection",
    "settings": {
        "title": title, "heading_size": "h1", "description": "", "show_description": False, "description_style": "body",
        "collection": handle, "products_to_show": 4, "columns_desktop": 4, "color_scheme": scheme, "full_width": False,
        "show_view_all": True, "view_all_style": "link", "enable_desktop_slider": False, "swipe_on_mobile": True,
        "image_ratio": "portrait", "image_shape": "default", "show_secondary_image": True, "show_vendor": False,
        "show_rating": False, "quick_add": "standard", "columns_mobile": "2", "padding_top": 56, "padding_bottom": 56,
    },
}
index = {
    "sections": {
        "hero": {
            "type": "image-banner",
            "blocks": {
                "caption": {"type": "text", "settings": {"text": "Summer basics, made for the heat", "text_style": "subtitle"}},
                "heading": {"type": "heading", "settings": {"heading": "Easy tees for long, warm days", "heading_size": "h0"}},
                "buttons": {"type": "buttons", "settings": {
                    "button_label_1": "Shop men", "button_link_1": "shopify://collections/men", "button_style_secondary_1": False,
                    "button_label_2": "Shop women", "button_link_2": "shopify://collections/women", "button_style_secondary_2": True}},
            },
            "block_order": ["caption", "heading", "buttons"],
            "settings": {
                "image": "shopify://shop_images/hero.png", "image_overlay_opacity": 0, "image_height": "large",
                "image_behavior": "none", "desktop_content_position": "bottom-center", "desktop_content_alignment": "center",
                "show_text_box": True, "color_scheme": "scheme-1", "stack_images_on_mobile": False,
                "mobile_content_alignment": "center", "show_text_below": True,
            },
        },
        "usp": {
            "type": "multicolumn",
            "blocks": {
                f"c{i}": {"type": "column", "settings": {"title": t, "text": f"<p>{x}</p>", "link_label": "", "link": ""}}
                for i, (t, x) in enumerate([
                    ("Free shipping over $50", "Flat $4 shipping on smaller orders."),
                    ("30-day returns", "Wrong size? Swap it, no questions asked."),
                    ("Fabrics that breathe", "Cotton, linen and modal picked for humid weather."),
                ])
            },
            "block_order": ["c0", "c1", "c2"],
            "settings": {"title": "", "heading_size": "h2", "image_width": "third", "image_ratio": "adapt", "button_label": "",
                         "button_link": "", "columns_desktop": 3, "column_alignment": "center", "background_style": "none",
                         "color_scheme": "scheme-2", "columns_mobile": "1", "swipe_on_mobile": False, "padding_top": 36, "padding_bottom": 28},
        },
        "best": featured("Best sellers", "best-sellers", "scheme-1"),
        "collections": {
            "type": "collection-list",
            "blocks": {h: {"type": "featured_collection", "settings": {"collection": h}} for h in ["men", "women", "kids"]},
            "block_order": ["men", "women", "kids"],
            "settings": {"title": "Shop by category", "heading_size": "h1", "image_ratio": "portrait", "columns_desktop": 3,
                         "color_scheme": "scheme-2", "show_view_all": False, "columns_mobile": "1", "swipe_on_mobile": True,
                         "padding_top": 56, "padding_bottom": 56},
        },
        "new": featured("New arrivals", "new-arrivals", "scheme-1"),
        "story": {
            "type": "image-with-text",
            "blocks": {
                "caption": {"type": "caption", "settings": {"caption": "Our story", "text_style": "subtitle", "text_size": "medium"}},
                "heading": {"type": "heading", "settings": {"heading": "Made for Saigon weather", "heading_size": "h1"}},
                "text": {"type": "text", "settings": {"text": "<p>Thirty-five degrees outside, twenty inside. We design for both: light fabrics that dry fast, cuts that leave room to move, and colours that go with everything you already own.</p>", "text_style": "body"}},
                "button": {"type": "button", "settings": {"button_label": "Read more", "button_link": "shopify://pages/about", "button_style_secondary": True}},
            },
            "block_order": ["caption", "heading", "text", "button"],
            "settings": {"image": "shopify://shop_images/story.png", "height": "adapt", "desktop_image_width": "medium",
                         "layout": "image_first", "image_behavior": "none", "content_layout": "no-overlap",
                         "desktop_content_position": "middle", "desktop_content_alignment": "left", "mobile_content_alignment": "left",
                         "section_color_scheme": "scheme-1", "color_scheme": "scheme-1", "padding_top": 56, "padding_bottom": 56},
        },
        "newsletter": {
            "type": "newsletter",
            "blocks": {
                "heading": {"type": "heading", "settings": {"heading": "10% off your first order", "heading_size": "h1"}},
                "paragraph": {"type": "paragraph", "settings": {"text": "<p>Join the list for new drops and restocks. Demo store: no emails are sent.</p>"}},
                "email_form": {"type": "email_form", "settings": {}},
            },
            "block_order": ["heading", "paragraph", "email_form"],
            "settings": {"color_scheme": "scheme-3", "full_width": True, "padding_top": 56, "padding_bottom": 64},
        },
    },
    "order": ["hero", "usp", "best", "collections", "new", "story", "newsletter"],
}
save("templates/index.json", index)

# ---------- product page: swatches, size guide popup, info tabs
product = load("templates/product.json")
main = product["sections"]["main"]
main["blocks"]["variant_picker"]["settings"].update(picker_type="button", swatch_shape="circle")
main["blocks"]["size_guide"] = {"type": "popup", "settings": {"text": "Size guide", "page": "size-guide"}}
main["blocks"]["perks"] = {"type": "icon-with-text", "settings": {
    "layout": "horizontal", "icon_1": "truck", "heading_1": "Free shipping over $50",
    "icon_2": "return", "heading_2": "30-day returns", "icon_3": "washing", "heading_3": "Machine washable"}}
main["blocks"]["shipping"] = {"type": "collapsible_tab", "settings": {
    "heading": "Shipping & returns", "icon": "truck",
    "content": "<p>Orders ship in 1–2 business days. Free shipping over $50. Unworn items can be returned within 30 days.</p><p><em>Demo store: orders are test orders and nothing ships.</em></p>"}}
order = [b for b in main["block_order"] if b not in ("size_guide", "perks", "shipping", "vendor")]
order.insert(order.index("variant_picker") + 1, "size_guide")
order.insert(order.index("buy_buttons") + 1, "perks")
order.insert(order.index("description") + 1, "shipping")
main["block_order"] = order
save("templates/product.json", product)

print("theme customized")
