package com.lgdx.family;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public MainActivity() {
        registerPlugin(LiveCareStatusPlugin.class);
    }
}
