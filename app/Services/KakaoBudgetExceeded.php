<?php

namespace App\Services;

use RuntimeException;

/**
 * 카카오 API 호출 예산(분당·일일)을 다 써서 더 부르지 않음.
 * 요청 폭주로 할당량이 바닥나거나 서버가 카카오에 요청을 쏟아내는 것을 막는다.
 */
class KakaoBudgetExceeded extends RuntimeException {}
