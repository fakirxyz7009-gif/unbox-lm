#pragma once

#include "pluginterfaces/base/funknown.h"

namespace Steinberg::Vst {

// Private test-fixture UID; this is not a user-facing Unbox product ID.
static DECLARE_UID(kUnboxTestDelayProcessorUID,
    0x71D2AB5A, 0x9FD54C72, 0xB82789CE, 0x1A4D33F6);
static DECLARE_UID(kUnboxTestDelayControllerUID,
    0x47A11C90, 0xEBB74C5C, 0xA4E9D06F, 0x57B2A381);

} // namespace Steinberg::Vst
