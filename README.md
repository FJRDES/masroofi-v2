# Masroofi_V2_Firebase

تطبيق مصروفي V2 مع Firebase Firestore وGoogle Authentication.

## ملفات المشروع
- `index.html`
- `style.css`
- `app.js`
- `manifest.json`
- `sw.js`
- `icon.svg`

## Firebase
تم وضع إعدادات Firebase داخل `app.js` بناء على مشروعك:
`masroofi-17e2d`

## Authorized domains
من Firebase Console:
Authentication → Settings → Authorized domains
أضف:

```text
fjrdes.github.io
```

## Firestore Rules
اذهب إلى Firestore → Rules ثم استبدل القواعد بالتالي وانشرها:

```javascript
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

## الرفع على GitHub
1. فك الضغط.
2. ادخل مجلد `Masroofi_V2_Firebase`.
3. ارفع جميع الملفات إلى مستودع `masroofi` واستبدل القديمة.
4. Commit message: `Masroofi V2 Firebase sync`.
5. انتظر GitHub Pages من دقيقة إلى ثلاث دقائق.
6. افتح: `https://fjrdes.github.io/masroofi/`

## اختبار المزامنة
1. افتح التطبيق من الكمبيوتر وسجل الدخول.
2. أضف مصروفًا.
3. افتح الرابط من الآيفون وسجل الدخول بنفس حساب Google.
4. ستظهر العملية تلقائيًا.
