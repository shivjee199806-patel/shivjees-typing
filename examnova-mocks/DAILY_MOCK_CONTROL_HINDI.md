# Daily Mock Review Queue

- Server चालू रहने पर भारत के कैलेंडर दिन के अनुसार हर दिन 15 परीक्षाओं के लिए 1 Full + 1 Mini Draft बनेंगे (30 daily drafts).
- Server बंद रहने वाले दिन स्वतः backfill नहीं होते; शुरू होने पर आज के drafts बनते हैं।
- Draft tests प्रकाशित नहीं होते। एक ही तारीख में दोबारा Start/Refresh duplicate नहीं बनाएगा।
- Admin → Daily Mock Review Queue में Missing verified questions देखें, Edit Mock से Title/Time/Marking बदलें और Publish करें।
- प्रश्न Admin → Add MCQ से जोड़ें। सवाल की जाँच कर Verified लगाना आवश्यक है।
- प्रश्न, चारों विकल्पों की अलग explanations और notes बनाना अभी manually करना होगा। नया AI question writer या latest notification fetch इस संस्करण में नहीं है।
- यह मौजूदा database को उपयोग करता है; पुरानी `data/examnova.sqlite` की backup copy रखें।
- jptyping.in में कोई बदलाव या linking नहीं।
