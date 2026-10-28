#pragma once

#include "public.sdk/source/vst/vsteditcontroller.h"

namespace Steinberg::Vst {

class UnboxTestDelayController final : public EditController {
public:
    static FUnknown* createInstance(void*)
    {
        return static_cast<IEditController*>(new UnboxTestDelayController());
    }
};

} // namespace Steinberg::Vst
