# Masroofi V2 Firebase - UI Fixes

تحديثات هذه النسخة:
- منع إدخال نص في حقل المبلغ والتحقق من أن القيمة رقم أكبر من صفر.
- إظهار رسائل الميزانية والتنبيهات بشكل مقروء فوق نموذج الإضافة.
- نقل آخر العمليات فوق الرسوم البيانية في الرئيسية.
- تحسين مقياس الرسوم البيانية وثبات ارتفاعها داخل البطاقة.
- إضافة الرسوم البيانية داخل التقارير المطبوعة.
- إضافة زر عودة/إغلاق في صفحة التقرير.
- تعديل ألوان بطاقات اليوم/الأسبوع/الشهر: أخضر أقل من نصف الحد، برتقالي من 50% إلى الحد، أحمر عند تجاوز الحد.
- إصلاح امتداد حقول التاريخ والوقت خارج النموذج.
- تحديث الأيقونة بتصميم دائرتين متناسقتين.

## Firestore Rules

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```
