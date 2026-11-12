#pragma once

#include "public.sdk/source/vst/vsteditcontroller.h"

namespace Steinberg::Vst {

class UnboxTestSynthController final : public EditController {
public:
    static FUnknown* createInstance(void*)
    {
        return static_cast<IEditController*>(new UnboxTestSynthController());
    }
};

} // namespace Steinberg::Vst
