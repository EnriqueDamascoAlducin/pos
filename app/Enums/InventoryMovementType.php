<?php

namespace App\Enums;

enum InventoryMovementType: string
{
    case Sale = 'sale';
    case SaleCancel = 'sale_cancel';
    case Purchase = 'purchase';
    case Adjustment = 'adjustment';
    case TransferIn = 'transfer_in';
    case TransferOut = 'transfer_out';
    case Return = 'return';
}
