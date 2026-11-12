#pragma once

#include "pluginterfaces/base/funknown.h"

namespace Steinberg::Vst {

// Private test-fixture UIDs; these are not user-facing Unbox product IDs.
static DECLARE_UID(kUnboxTestSynthProcessorUID,
    0x5E43B8D1, 0x714B4E2A, 0xA532C97F, 0x08D63B14);
static DECLARE_UID(kUnboxTestSynthControllerUID,
    0x2AF4D690, 0x83C14B7E, 0x9A502D61, 0xF0378C25);

} // namespace Steinberg::Vst
