# البنية

## قاعدة الاعتماد

```
        nodes/           ← عقد ROS (تركيب فقط، بلا منطق)
          │
        adapters/        ← MediaPipe، OpenCV، ROS، MAVSDK
          │
   core/ports/           ← بروتوكولات مجردة (Protocol)
          │
   core/usecases/        ← تنسيق القرار
          │
   core/domain/          ← القواعد. لا تستورد شيئاً خارج stdlib
```

الأسهم تتجه للداخل فقط. `core/` لا يعرف شيئاً عن ROS ولا OpenCV ولا
MediaPipe — وهذا مُختبَر آلياً في `tests/test_architecture.py`، لا
متروك للانضباط الشخصي.

## أين تبحث عن ماذا

| السؤال | الملف |
|---|---|
| ما تعريف «سقط»؟ | `core/domain/posture.py` |
| ما تعريف «سحابة غاز»؟ | `core/domain/plume.py` |
| متى يُغلق صمام SCADA؟ | `core/domain/plume.py` → `FusionPolicy` |
| كم ثانية قبل التأكيد؟ | `core/domain/state_machine.py` |
| كيف تُقرأ الصورة؟ | `adapters/vision.py` |
| أين تُنشر الإنذارات؟ | `adapters/alert_sinks.py` |
| أسماء المواضيع والمعاملات | `nodes/*.py` |

## لماذا هذا يهم للعتاد الحقيقي

الانتقال للدرون الفعلي يصير استبدال محوّلات (adapters) لا إعادة كتابة:

| اليوم | على العتاد | ما يتغير فوقه |
|---|---|---|
| `MediaPipePoseAdapter` | `TwoStagePoseAdapter` (YOLO + Pose) | لا شيء |
| `Mog2SegmenterAdapter` | `OgiSegmenterAdapter` (نطاق الامتصاص) | لا شيء |
| `RosClock` | كما هو | لا شيء |

قواعد القرار في `core/` لا تُمَس. هذه هي الفائدة العملية الوحيدة التي
تبرر البنية النظيفة في مشروع بهذا الحجم.

## آلة الحالات موحّدة

الكاشفان يطرحان نفس السؤال: «هل هذا الإطار خاطئ بما يكفي، ولمدة كافية،
لإيقاظ أحد؟» — فكُتبت القاعدة مرة واحدة في `ConfirmationMachine` بدل
نسختين تتباعدان مع الوقت.

## التشغيل

```bash
python3 -m pytest tests/ -v          # ١٣ اختباراً، أقل من ثانية
python3 tests/test_architecture.py   # قاعدة الاعتماد
python3 tests/test_detect_fall.py --ablation
python3 tests/test_detect_gas.py

colcon build --packages-select baseer2_interfaces baseer2_ai
ros2 run baseer2_ai fall_detection
ros2 run baseer2_ai gas_vision
```
