package com.lgdx.family;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LiveCareStatus")
public class LiveCareStatusPlugin extends Plugin {
    private static final String CHANNEL = "family-care-status";
    private static final int NOTIFICATION_ID = 91001;

    @PluginMethod
    public void update(PluginCall call) {
        String child = call.getString("child", "아이");
        String caregiver = call.getString("caregiver", "담당자");
        String status = call.getString("status", "돌봄 진행 중");
        String detail = call.getString("detail", "현재 돌봄 현황");
        int progressValue = Math.max(0, Math.min(2, call.getInt("progress", 1)));
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "돌봄 현황판", NotificationManager.IMPORTANCE_LOW));
        }
        RemoteViews view = new RemoteViews(getContext().getPackageName(), R.layout.notification_live_care);
        view.setTextViewText(R.id.live_child, child + " · " + caregiver);
        view.setTextViewText(R.id.live_status, status);
        view.setTextViewText(R.id.live_detail, detail);
        Intent launch = getActivity().getIntent();
        PendingIntent pending = PendingIntent.getActivity(getContext(), NOTIFICATION_ID, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        if (Build.VERSION.SDK_INT >= 36) {
            NotificationCompat.ProgressStyle progress = new NotificationCompat.ProgressStyle()
                .setProgress(progressValue)
                .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(1).setColor(Color.rgb(211, 47, 101)))
                .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(1).setColor(Color.rgb(211, 47, 101)))
                .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(1).setColor(Color.rgb(238, 238, 238)))
                .addProgressPoint(new NotificationCompat.ProgressStyle.Point(0).setColor(Color.rgb(211, 47, 101)))
                .addProgressPoint(new NotificationCompat.ProgressStyle.Point(1).setColor(Color.rgb(211, 47, 101)))
                .addProgressPoint(new NotificationCompat.ProgressStyle.Point(2).setColor(Color.rgb(238, 238, 238)));
            NotificationCompat.Builder live = new NotificationCompat.Builder(getContext(), CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(child + " · " + caregiver)
                .setContentText(status + " · " + detail)
                .setStyle(progress)
                .setContentIntent(pending)
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setShortCriticalText(progressValue > 0 ? "돌봄 중" : "담당 확인")
                .setOnlyAlertOnce(true)
                .setRequestPromotedOngoing(true);
            manager.notify(NOTIFICATION_ID, live.build());
        } else {
            NotificationCompat.Builder notification = new NotificationCompat.Builder(getContext(), CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(child + " · " + caregiver)
                .setContentText(status)
                .setCustomContentView(view)
                .setCustomBigContentView(view)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setContentIntent(pending)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            manager.notify(NOTIFICATION_ID, notification.build());
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(NOTIFICATION_ID);
        call.resolve();
    }
}
